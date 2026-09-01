/**
 * kuromoji（形態素解析）の最小の型。パッケージに型定義が無いので、
 * 読みの照合（yomi_check.ts）が使う分だけをここで宣言する。
 */
declare module "kuromoji" {
  export interface IpadicFeatures {
    /** 表層形（入力文字列の断片。全 token を連結すると元の文に戻る）。 */
    surface_form: string;
    /** 読み（カタカナ）。未知語・記号・数字には無い。 */
    reading?: string;
    /** 品詞（例: 名詞・助詞・記号）。 */
    pos: string;
  }

  export interface Tokenizer {
    tokenize(text: string): IpadicFeatures[];
  }

  export interface TokenizerBuilder {
    build(callback: (err: Error | null, tokenizer: Tokenizer) => void): void;
  }

  const kuromoji: {
    builder(options: { dicPath: string }): TokenizerBuilder;
  };
  export default kuromoji;
}
