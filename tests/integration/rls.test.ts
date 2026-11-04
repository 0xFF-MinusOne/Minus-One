import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  anon,
  cleanup,
  createTempUser,
  currentCounter,
  jwtAal,
  local,
  rememberCounter,
  setSequence,
  sql,
  signInAal1,
  totp,
  type TempUser,
} from './helpers';

let adminUser: TempUser;
let memberA: TempUser;
let memberB: TempUser;
let outsider: TempUser;
let projectId: string;
let findingId: string;

beforeAll(async () => {
  await rememberCounter();
  adminUser = await createTempUser('admin', 'admin');
  memberA = await createTempUser('a', 'member');
  memberB = await createTempUser('b', 'member');
  outsider = await createTempUser('outsider', null);

  const project = await memberA.client.from('projects').insert({ name: '共有の案件' }).select().single();
  if (project.error) throw project.error;
  projectId = project.data.id;
  const finding = await memberA.client.from('findings').insert({ project_id: projectId, title: '共有の指摘' }).select().single();
  if (finding.error) throw finding.error;
  findingId = finding.data.id;
});

afterAll(cleanup);

describe('(a) 2 段階認証の強制', () => {
  it('aal1 のセッションでは REST からデータが読めない', async () => {
    const client = await signInAal1(memberA);
    const session = (await client.auth.getSession()).data.session;
    expect(jwtAal(session?.access_token)).toBe('aal1');

    for (const table of ['projects', 'findings', 'members'] as const) {
      const { data, error } = await client.from(table).select('*');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
    // ライブラリを介さず REST を直接呼んでも同じ。
    const response = await fetch(`${local.url}/rest/v1/findings?select=id`, {
      headers: { apikey: local.anonKey, Authorization: `Bearer ${session?.access_token}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('aal1 のセッションでは書き込めない', async () => {
    const client = await signInAal1(memberA);
    const project = await client.from('projects').insert({ name: 'aal1' }).select();
    expect(project.error?.code).toBe('42501');
    const finding = await client.from('findings').insert({ project_id: projectId, title: 'aal1' }).select();
    expect(finding.error?.code).toBe('42501');
    const update = await client.from('projects').update({ name: 'aal1' }).eq('id', projectId).select();
    expect(update.data).toEqual([]);
    const rpc = await client.rpc('import_trivy_findings', { p_project_id: projectId, p_items: [] });
    expect(rpc.error?.code).toBe('P0002');
  });

  it('コードを確認して aal2 になると読める', async () => {
    const before = await admin.from('findings').select('id').eq('project_id', projectId);
    const client = await signInAal1(memberA);
    let verified = await client.auth.mfa.challengeAndVerify({ factorId: memberA.factorId, code: totp(memberA.totpSecret) });
    if (verified.error) {
      // 同じコードの再利用が拒否された場合は、次のコードで試す。
      await new Promise((resolve) => setTimeout(resolve, 31_000));
      verified = await client.auth.mfa.challengeAndVerify({ factorId: memberA.factorId, code: totp(memberA.totpSecret) });
    }
    expect(verified.error).toBeNull();
    const session = (await client.auth.getSession()).data.session;
    expect(jwtAal(session?.access_token)).toBe('aal2');
    const { data } = await client.from('findings').select('id').eq('project_id', projectId);
    expect(data).toHaveLength(before.data?.length ?? -1);
    expect(data?.length).toBeGreaterThan(0);
  });

  it('誤ったコードでは aal2 にならない', async () => {
    const client = await signInAal1(memberB);
    const wrong = totp(memberB.totpSecret) === '000000' ? '111111' : '000000';
    const verified = await client.auth.mfa.challengeAndVerify({ factorId: memberB.factorId, code: wrong });
    expect(verified.error).not.toBeNull();
    const { data } = await client.from('projects').select('id');
    expect(data).toEqual([]);
  });

  it('aal1 のままでは 2 つ目の登録や解除で迂回できない', async () => {
    const client = await signInAal1(memberB);
    const enroll = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'second' });
    expect(enroll.error).not.toBeNull();
    const removed = await client.auth.mfa.unenroll({ factorId: memberB.factorId });
    expect(removed.error).not.toBeNull();
  });
});

describe('(b) 非メンバー', () => {
  it('aal2 でも読めない', async () => {
    const session = (await outsider.client.auth.getSession()).data.session;
    expect(jwtAal(session?.access_token)).toBe('aal2');
    for (const table of ['projects', 'findings', 'members'] as const) {
      const { data, error } = await outsider.client.from(table).select('*');
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  it('aal2 でも書けない', async () => {
    const project = await outsider.client.from('projects').insert({ name: '部外者' }).select();
    expect(project.error?.code).toBe('42501');
    const finding = await outsider.client.from('findings').insert({ project_id: projectId, title: '部外者' }).select();
    expect(finding.error?.code).toBe('42501');
    const update = await outsider.client.from('findings').update({ title: '部外者' }).eq('id', findingId).select();
    expect(update.data).toEqual([]);
    const selfJoin = await outsider.client.from('members').insert({ user_id: outsider.id, email: outsider.email, role: 'admin' }).select();
    expect(selfJoin.error?.code).toBe('42501');
    const rpc = await outsider.client.rpc('import_trivy_findings', { p_project_id: projectId, p_items: [] });
    expect(rpc.error?.code).toBe('P0002');
  });
});

describe('(c) 権限', () => {
  it('メンバーは全員のデータを読み書きできる', async () => {
    const read = await memberB.client.from('findings').select('title').eq('id', findingId).single();
    expect(read.data?.title).toBe('共有の指摘');
    const update = await memberB.client.from('findings').update({ status: 'in_progress' }).eq('id', findingId).select().single();
    expect(update.error).toBeNull();
    expect(update.data?.status).toBe('in_progress');
  });

  it('member は削除できず、admin はできる', async () => {
    const memberProject = await memberB.client.from('projects').delete().eq('id', projectId).select();
    expect(memberProject.data).toEqual([]);
    const memberFinding = await memberB.client.from('findings').delete().eq('id', findingId).select();
    expect(memberFinding.data).toEqual([]);
    expect((await admin.from('findings').select('id').eq('id', findingId)).data).toHaveLength(1);

    const extra = await memberA.client.from('findings').insert({ project_id: projectId, title: '消す指摘' }).select().single();
    const extraProject = await memberA.client.from('projects').insert({ name: '消す案件' }).select().single();
    const adminFinding = await adminUser.client.from('findings').delete().eq('id', extra.data?.id ?? '').select();
    expect(adminFinding.data).toHaveLength(1);
    const adminProject = await adminUser.client.from('projects').delete().eq('id', extraProject.data?.id ?? '').select();
    expect(adminProject.data).toHaveLength(1);
  });

  it('member はメンバーを変更できず、admin はできる', async () => {
    const promote = await memberB.client.from('members').update({ role: 'admin' }).eq('user_id', memberB.id).select();
    expect(promote.data).toEqual([]);
    const demote = await memberB.client.from('members').update({ is_active: false }).eq('user_id', adminUser.id).select();
    expect(demote.data).toEqual([]);
    const add = await memberB.client.from('members').insert({ user_id: outsider.id, email: outsider.email }).select();
    expect(add.error?.code).toBe('42501');
    const remove = await memberB.client.from('members').delete().eq('user_id', memberA.id).select();
    expect(remove.data).toEqual([]);
    expect((await admin.from('members').select('role').eq('user_id', memberB.id).single()).data?.role).toBe('member');

    const updated = await adminUser.client.from('members').update({ role: 'admin' }).eq('user_id', memberB.id).select().single();
    expect(updated.data?.role).toBe('admin');
    const back = await adminUser.client.from('members').update({ role: 'member' }).eq('user_id', memberB.id).select().single();
    expect(back.data?.role).toBe('member');

    const added = await adminUser.client.from('members').insert({ user_id: outsider.id, email: outsider.email }).select();
    expect(added.error).toBeNull();
    expect((await outsider.client.from('projects').select('id')).data?.length).toBeGreaterThan(0);
    const removed = await adminUser.client.from('members').delete().eq('user_id', outsider.id).select();
    expect(removed.data).toHaveLength(1);
    expect((await outsider.client.from('projects').select('id')).data).toEqual([]);
  });

  it('無効にしたメンバーは発行済みのトークンでもすぐ読めなくなる', async () => {
    await adminUser.client.from('members').update({ is_active: false }).eq('user_id', memberB.id);
    expect((await memberB.client.from('projects').select('id')).data).toEqual([]);
    await adminUser.client.from('members').update({ is_active: true }).eq('user_id', memberB.id);
    expect((await memberB.client.from('projects').select('id')).data?.length).toBeGreaterThan(0);
  });

  it('有効な admin を 0 人にできない', async () => {
    const others = await admin.from('members').select('user_id').eq('role', 'admin').eq('is_active', true).neq('user_id', adminUser.id);
    const otherIds = (others.data ?? []).map((row) => row.user_id);
    try {
      if (otherIds.length > 0) {
        const off = await admin.from('members').update({ is_active: false }).in('user_id', otherIds);
        expect(off.error).toBeNull();
      }
      const demote = await adminUser.client.from('members').update({ role: 'member' }).eq('user_id', adminUser.id).select();
      expect(demote.error?.code).toBe('MO001');
      const remove = await adminUser.client.from('members').delete().eq('user_id', adminUser.id).select();
      expect(remove.error?.code).toBe('MO001');
    } finally {
      if (otherIds.length > 0) await admin.from('members').update({ is_active: true }).in('user_id', otherIds);
    }
  });
});

describe('記録と採番', () => {
  it('作成者と更新者を記録し、偽装できない', async () => {
    const project = await memberA.client
      .from('projects')
      .insert({ name: '記録の確認', created_by: memberB.id, updated_by: memberB.id })
      .select()
      .single();
    expect(project.data?.created_by).toBe(memberA.id);
    expect(project.data?.updated_by).toBe(memberA.id);

    const edited = await memberB.client
      .from('projects')
      .update({ name: '変更', created_by: memberB.id, updated_by: memberA.id })
      .eq('id', project.data?.id ?? '')
      .select()
      .single();
    expect(edited.data?.created_by).toBe(memberA.id);
    expect(edited.data?.updated_by).toBe(memberB.id);

    const finding = await memberB.client.from('findings').update({ title: '共有の指摘（変更）' }).eq('id', findingId).select().single();
    expect(finding.data?.created_by).toBe(memberA.id);
    expect(finding.data?.updated_by).toBe(memberB.id);
    await adminUser.client.from('projects').delete().eq('id', project.data?.id ?? '');
  });

  it('連番はチーム全体で 1 つで、指定した seq を無視する', async () => {
    const start = currentCounter();
    const first = await memberA.client.from('findings').insert({ project_id: projectId, title: '番号 1', seq: 999 }).select().single();
    const second = await memberB.client.from('findings').insert({ project_id: projectId, title: '番号 2' }).select().single();
    expect(first.data?.seq).toBe(start + 1);
    expect(second.data?.seq).toBe(start + 2);
    expect(first.data?.ref_id).toMatch(/^PEN-\d{4,}$/);
    const pinned = await memberA.client.from('findings').update({ seq: 500 }).eq('id', first.data?.id ?? '').select('seq').single();
    expect(pinned.data?.seq).toBe(start + 1);
    await adminUser.client.from('findings').delete().in('id', [first.data?.id ?? '', second.data?.id ?? '']);
  });

  it('1 万件を超えても ID を切り詰めない', async () => {
    const start = currentCounter();
    setSequence(9999);
    const { data, error } = await memberA.client.from('findings').insert({ project_id: projectId, title: '桁の確認' }).select('ref_id,id').single();
    expect(error).toBeNull();
    expect(data?.ref_id).toBe('PEN-10000');
    await adminUser.client.from('findings').delete().eq('id', data?.id ?? '');
    setSequence(start);
  });

  it('ユーザーを消しても検出事項は残り、作成者が空になる', async () => {
    const leaver = await createTempUser('leaver', 'member');
    const project = await leaver.client.from('projects').insert({ name: '退職者の案件' }).select().single();
    const finding = await leaver.client.from('findings').insert({ project_id: project.data?.id ?? '', title: '退職者の指摘' }).select().single();
    const deleted = await admin.auth.admin.deleteUser(leaver.id);
    expect(deleted.error).toBeNull();
    const row = await admin.from('findings').select('created_by,title,seq').eq('id', finding.data?.id ?? '').single();
    expect(row.data).toMatchObject({ created_by: null, title: '退職者の指摘', seq: finding.data?.seq });
    await admin.from('projects').delete().eq('id', project.data?.id ?? '');
  });

  it('採番のシーケンスは authenticated も anon も操作できない', () => {
    for (const role of ['authenticated', 'anon']) {
      expect(sql(`select has_sequence_privilege('${role}', 'public.finding_seq', 'USAGE,SELECT,UPDATE')`)).toBe('f');
    }
  });

  it('定義者権限の関数はすべて search_path を固定している', () => {
    const unfixed = sql(`
      select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
    expect(unfixed).toBe('0');
  });

  it('すべてのテーブルで RLS が有効', () => {
    expect(sql(`select count(*) from pg_tables where schemaname = 'public' and not rowsecurity`)).toBe('0');
  });
});

describe('anon（未ログイン）', () => {
  it.each(['projects', 'findings', 'members'] as const)('%s を読めない', async (table) => {
    const { data, error } = await anon.from(table).select('*');
    expect(data ?? []).toEqual([]);
    expect(error?.code).toBe('42501');
  });

  it('REST API を直接呼んでも拒否される', async () => {
    const response = await fetch(`${local.url}/rest/v1/findings?select=*`, {
      headers: { apikey: local.anonKey, Authorization: `Bearer ${local.anonKey}` },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: '42501' });
  });

  it('書き込みも RPC もできない', async () => {
    const insert = await anon.from('projects').insert({ name: '匿名' }).select();
    expect(insert.error?.code).toBe('42501');
    const rpc = await anon.rpc('import_trivy_findings', { p_project_id: projectId, p_items: [] });
    expect(rpc.error).not.toBeNull();
  });
});

describe('設定', () => {
  it('新規登録は無効', async () => {
    const { data, error } = await anon.auth.signUp({
      email: 'signup-test@pentest-dashboard.test',
      password: 'a-long-enough-password',
    });
    expect(data.user).toBeNull();
    expect(error?.code).toBe('signup_disabled');
  });
});
