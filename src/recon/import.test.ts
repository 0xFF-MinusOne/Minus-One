import {describe,it,expect} from 'vitest';
import {parseCsv,normalizeRows} from './import';
import {metrics,changedPercent} from './metrics';
import {emptyRecon} from './model';
import {inScope} from '../../apps/api/scope';
describe('入力の検証・共通化',()=>{
 it('引用符・改行・BOMを含むCSVを解析する',()=>{expect(parseCsv('\uFEFFhost,tags\r\n"a.test","one;two"\r\n')).toEqual([{host:'a.test',tags:'one;two'}]);expect(parseCsv('host,note\na.test,"line1\nline2"')[0]?.note).toBe('line1\nline2')});
 it('不正なCSV・重複ホスト・注入値・範囲外ポートを拒否する',()=>{
  expect(()=>parseCsv('host,host\na,b')).toThrow();expect(()=>parseCsv('host\n"unclosed')).toThrow();
  for(const input of [[{host:'bad host'}],[{host:'a.test'},{host:'A.TEST.'}],[{host:'a.test',services:[{port:70000}]}],[{host:'1.2.3.4/24',type:'IP'}]])expect(()=>normalizeRows(input)).toThrow();
 });
 it('未観測の稼働や脆弱性を捏造しない',()=>{expect(normalizeRows([{host:'API.TEST.'}])[0]).toMatchObject({host:'api.test',risk:'Unknown',status:'Unknown'});expect(metrics(emptyRecon)).toEqual({assets:0,live:0,ports:0,subdomains:0,technologies:0,critical:0});expect(changedPercent(4,undefined)).toBe('比較データなし')});
});
describe('HonoのScope検証',()=>{
 const rules=[{kind:'domain',value:'example.test',authorization:'契約書',excluded:false},{kind:'domain',value:'admin.example.test',authorization:'除外',excluded:true}];
 it('ドメイン境界と除外を優先する',()=>{expect(inScope('https://api.example.test',rules)).toBe(true);expect(inScope('https://example.test.attacker.test',rules)).toBe(false);expect(inScope('admin.example.test',rules)).toBe(false)});
 it('IPとCIDRを正確に扱い、URLの認証情報やシェル引数を拒否する',()=>{const r=[{kind:'cidr',value:'10.0.0.0/24',authorization:'契約',excluded:false}];expect(inScope('10.0.0.20',r)).toBe(true);expect(inScope('10.0.1.1',r)).toBe(false);expect(()=>inScope('https://user:pass@example.test',rules)).toThrow();expect(()=>inScope('-oX injected',rules)).toThrow()});
});
