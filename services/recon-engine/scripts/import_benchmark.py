"""Import a user-provided IPA workbook bundle without executing HTML, formulas, or macros."""
import argparse,hashlib,io,json,re,zipfile
from pathlib import Path,PurePosixPath
from html.parser import HTMLParser
from xml.etree import ElementTree as E
EXPECTED='c0c79dac1a3db9e914ad752e0f1e4ea9c3160c40cab28cdd82c7c9a128744eb7'
class Question(HTMLParser):
    def __init__(self):super().__init__();self.tag='';self.section='';self.title='';self.question=''
    def handle_starttag(self,tag,attrs):self.tag=tag
    def handle_data(self,data):
        if self.tag=='h2':self.title+=data.strip()
        elif self.tag=='h3':self.section=data.strip()
        elif self.tag=='p' and self.section=='設問':self.question+=data.strip()
def convert(path:Path):
    content=path.read_bytes()
    if len(content)>10*1024*1024:raise ValueError('ZIPが大きすぎます')
    sha=hashlib.sha256(content).hexdigest()
    if sha!=EXPECTED:raise ValueError('指定されたbenchmark.zipのチェックサムと一致しません')
    items=[]
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        if len(archive.infolist())>200 or sum(i.file_size for i in archive.infolist())>20*1024*1024:raise ValueError('アーカイブ上限を超えました')
        for i in archive.infolist():
            p=PurePosixPath(i.filename)
            if p.is_absolute() or '..' in p.parts or ((i.external_attr>>16)&0o170000)==0o120000:raise ValueError('安全でないアーカイブです')
        for i in range(1,28):
            name=f'benchmark/doc/{i:02}.html';parser=Question();parser.feed(archive.read(name).decode('utf8'))
            items.append({'id':i,'title':parser.title,'question':parser.question,'source_file':name})
        xlsx=next(n for n in archive.namelist() if n.endswith('.xlsx'))
        with zipfile.ZipFile(io.BytesIO(archive.read(xlsx))) as workbook:
            texts=[''.join(i.itertext()) for i in E.fromstring(workbook.read('xl/sharedStrings.xml'))]
            choices=[s for s in texts if re.match(r'^[1-5]\.\s',s) and len(s)<300 and '\n' not in s and ('方針' in s or '4.に加え' in s)]
    return {'title':'IPA 情報セキュリティ対策ベンチマーク','version':'5.1','sha256':sha,'source':'https://www.ipa.go.jp/security/sec-tools/benchmark.html','items':items,'original_choices':choices,'choices':{'management':choices[:5],'implementation':choices[5:8]+choices[3:5]},'scoring_note':'回答1〜5の単純合計のみ表示可能。IPA公式の属性別比較・統計スコアは再現していません。'}
def main():
    p=argparse.ArgumentParser();p.add_argument('archive',type=Path);p.add_argument('--output',type=Path,required=True);args=p.parse_args();value=convert(args.archive);args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(value,ensure_ascii=False,indent=2));print(f'{len(value["items"])}設問を安全に取り込みました。SHA256={value["sha256"]}')
if __name__=='__main__':main()
