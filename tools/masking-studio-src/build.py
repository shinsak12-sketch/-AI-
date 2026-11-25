"""마스킹 스튜디오 빌드 — 분할 소스를 하나의 오프라인 HTML로 합침.

    python3 tools/masking-studio-src/build.py

내장 라이브러리(SheetJS 0.18.5, 약 880KB)는 저장소에 따로 두지 않고
기존 빌드 결과(tools/masking-studio.html)에서 꺼내 다시 씀.
"""
import io, os
HERE=os.path.dirname(os.path.abspath(__file__))
OUT=os.path.join(HERE,'..','masking-studio.html')
rd=lambda f: io.open(os.path.join(HERE,f),encoding='utf-8').read()

old=io.open(OUT,encoding='utf-8').read()
a=old.index('<script id="xlsxlib">')
a=old.index('\n',a)+1
lib=old[a:old.index('\n</script>\n',a)]

app=''.join(rd(f) for f in ['a-util.js','engine.js','b-ui.js','c-run.js','worker.js','d-rest.js'])
html=rd('shell.html')+rd('libhdr.txt')+lib+'\n</script>\n<script>\n'+app+'\n</script>\n</body>\n</html>\n'
io.open(OUT,'w',encoding='utf-8').write(html)
print('built', OUT, len(html.encode('utf-8')), 'bytes')
