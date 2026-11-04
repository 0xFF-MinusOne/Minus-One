/** アプリ一覧。アプリを増やすときはここに追加する。url がなければ「準備中」と表示する。 */
export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  url?: string;
}

export const products: Product[] = [
  {
    id: 'recon', name: 'Minus One Recon', category: '攻撃対象面管理',
    description: '資産・サブドメイン・サービス・調査メモをまとめ、診断の仮説につなげます。',
    icon: '/brand/0xff-mark.png', url: '/recon',
  },
  {
    id: "pentest-dashboard",
    name: "Pentest Dashboard",
    category: "セキュリティ評価",
    description: "ペネトレーションテストのプロジェクト、検出事項、レポートをまとめて管理します。",
    icon: "/brand/pentest-dashboard-icon.png",
    url: "/pentest",
  },
];
