#!/usr/bin/env python3
"""Indexador leve do projeto (so biblioteca padrao). Gera PROJECT_INDEX.json na raiz.

Uso:  python indexer.py            (reindexa tudo)
      python indexer.py --check    (so diz se o indice esta desatualizado; nao grava)

Para cada arquivo de codigo registra: linguagem, linhas e simbolos [nome, tipo, linha_ini, linha_fim, pai].
 - .js   : funcoes, metodos (obj.metodo = function / chave: function), arrows, classes, objetos/constantes globais
 - .py   : classes, funcoes e metodos (via ast)
 - .html : secoes/dialogos com id, comentarios de bloco, scripts e estilos referenciados
 - .css  : comentarios de secao
 - .md   : titulos
Linhas comecam em 1. Pastas ignoradas: ver IGNORAR_DIRS (copias de versoes, manuais, caches).
"""
import ast
import json
import os
import re
import sys
from datetime import datetime

RAIZ = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(RAIZ, 'PROJECT_INDEX.json')
IGNORAR_DIRS = {'.git', 'node_modules', 'venv', '.venv', 'env', '__pycache__', '.cache', '.pytest_cache', '.mypy_cache',
                '.idea', '.vscode', 'dist', 'build', '.claude',
                'versoes',            # copias completas de cada versao (duplicam todo o codigo)
                'Manuais da maquina'}  # PDFs
IGNORAR_ARQ = {'PROJECT_INDEX.json'}  # arquivo gerado
EXT = {'.js': 'js', '.mjs': 'js', '.py': 'py', '.html': 'html', '.css': 'css', '.md': 'md'}
MAX_PROF_JS = 3        # profundidade maxima de aninhamento de simbolos JS no indice
MAX_MD_LINHAS = 400    # md muito longos (CHANGELOG): so os titulos de nivel 1-2 depois disso


def le(caminho):
    with open(caminho, 'rb') as f:
        dados = f.read()
    for enc in ('utf-8-sig', 'cp1252'):
        try:
            return dados.decode(enc)
        except UnicodeDecodeError:
            pass
    return dados.decode('latin-1')


# ---------------------------------------------------------------- JavaScript
def mascara_js(src):
    """Troca o conteudo de strings, comentarios, templates e regex por espacos (mantem quebras de linha e o tamanho)."""
    out = list(src)
    n, i, prev = len(src), 0, ''

    def apaga(a, b):
        for k in range(a, b):
            if out[k] != '\n':
                out[k] = ' '

    while i < n:
        c = src[i]
        if c == '/' and i + 1 < n and src[i + 1] == '/':
            j = src.find('\n', i)
            j = n if j < 0 else j
            apaga(i, j)
            i = j
            continue
        if c == '/' and i + 1 < n and src[i + 1] == '*':
            j = src.find('*/', i + 2)
            j = n if j < 0 else j + 2
            apaga(i, j)
            i = j
            continue
        if c in '"\'':
            j = i + 1
            while j < n and src[j] != c and src[j] != '\n':
                j += 2 if src[j] == '\\' else 1
            apaga(i + 1, min(j, n))
            i = j + 1
            prev = c
            continue
        if c == '`':
            j, prof = i + 1, 0
            while j < n:
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '$' and j + 1 < n and src[j + 1] == '{':
                    prof += 1
                    j += 2
                    continue
                if src[j] == '}' and prof:
                    prof -= 1
                elif src[j] == '`' and not prof:
                    break
                j += 1
            apaga(i + 1, min(j, n))
            i = j + 1
            prev = '`'
            continue
        if c == '/' and (prev == '' or prev in '(,=:[!&|?{};+-*%<>~^' or src[max(0, i - 7):i].strip().endswith(('return', 'typeof'))):
            j, classe = i + 1, False
            while j < n and src[j] != '\n':
                if src[j] == '\\':
                    j += 2
                    continue
                if src[j] == '[':
                    classe = True
                elif src[j] == ']':
                    classe = False
                elif src[j] == '/' and not classe:
                    break
                j += 1
            apaga(i + 1, min(j, n))
            i = j + 1
            prev = '/'
            continue
        if not c.isspace():
            prev = c
        i += 1
    return ''.join(out)


def fecha(m, ini):
    """Dado o indice de uma '{' (ou '(' / '[') em m, devolve o indice do fechamento correspondente (ou -1)."""
    abre = m[ini]
    par = {'{': '}', '(': ')', '[': ']'}[abre]
    prof = 0
    for k in range(ini, len(m)):
        ch = m[k]
        if ch == abre:
            prof += 1
        elif ch == par:
            prof -= 1
            if prof == 0:
                return k
    return -1


ID = r'[A-Za-z_$][\w$]*'
PADROES_JS = [
    ('function', re.compile(r'\bfunction\s*\*?\s*(' + ID + r')\s*\(')),
    ('method', re.compile(r'(' + ID + r'(?:\.' + ID + r')*)\s*[:=]\s*(?:async\s+)?function\b\s*\*?\s*(?:' + ID + r')?\s*\(')),
    ('arrow', re.compile(r'(?:\b(?:var|let|const)\s+|^|[\s,{;(])(' + ID + r'(?:\.' + ID + r')*)\s*[:=]\s*(?:async\s*)?(?:\([^()]*\)|' + ID + r')\s*=>', re.M)),
    ('class', re.compile(r'\bclass\s+(' + ID + r')')),
    ('object', re.compile(r'\b(?:var|let|const)\s+(' + ID + r')\s*=\s*(?=[{\[])')),
    ('global', re.compile(r'\bwindow\.(' + ID + r')\s*=\s*(?=[{\[]|' + ID + r'\s*;)')),
]
# metodo abreviado: nome(args) { ... }  (dentro de objetos/classes)
CURTO = re.compile(r'^[ \t]*(?:async\s+)?(' + ID + r')\s*\([^()]*\)\s*\{', re.M)
PALAVRAS = {'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'with'}


def indexa_js(src):
    m = mascara_js(src)
    linhas = [0]
    for k, ch in enumerate(src):
        if ch == '\n':
            linhas.append(k + 1)
    import bisect

    def lin(pos):
        return bisect.bisect_right(linhas, pos)

    achados = {}  # (ini_linha, nome) -> dict
    def add(nome, tipo, ini, fim):
        if fim < ini:
            fim = ini
        chave = (ini, nome)
        if chave not in achados:
            achados[chave] = {'nome': nome, 'tipo': tipo, 'ini': ini, 'fim': fim, 'a': 0, 'b': 0}

    for tipo, rx in PADROES_JS:
        for mt in rx.finditer(m):
            nome = mt.group(1)
            if nome in PALAVRAS:
                continue
            pos = mt.end()
            if tipo in ('object', 'global'):
                if tipo == 'global' and m[pos:pos + 1] not in '{[':
                    add('window.' + nome, 'global', lin(mt.start()), lin(mt.start()))
                    continue
                fimpos = fecha(m, pos)
                if fimpos < 0:
                    continue
                add(('window.' + nome) if tipo == 'global' else nome, tipo, lin(mt.start()), lin(fimpos))
                achados[(lin(mt.start()), ('window.' + nome) if tipo == 'global' else nome)].update(a=pos, b=fimpos)
                continue
            if tipo == 'class':
                ab = m.find('{', pos)
                fimpos = fecha(m, ab) if ab >= 0 else -1
                if fimpos >= 0:
                    add(nome, tipo, lin(mt.start()), lin(fimpos))
                    achados[(lin(mt.start()), nome)].update(a=ab, b=fimpos)
                continue
            if tipo == 'arrow':
                resto = m[mt.end():mt.end() + 200].lstrip()
                if resto.startswith('{'):
                    ab = mt.end() + (len(m[mt.end():mt.end() + 200]) - len(resto))
                    fimpos = fecha(m, ab)
                else:
                    ab = -1
                    fimpos = m.find(';', mt.end())
                    fimpos = len(m) - 1 if fimpos < 0 else fimpos
                if fimpos >= 0:
                    add(nome, 'arrow', lin(mt.start(1)), lin(fimpos))
                    if ab >= 0:
                        achados[(lin(mt.start(1)), nome)].update(a=ab, b=fimpos)
                continue
            # function / method: a '(' dos parametros termina em mt.end()-1
            par = fecha(m, mt.end() - 1)
            if par < 0:
                continue
            ab = m.find('{', par)
            if ab < 0 or m[par + 1:ab].strip():
                continue
            fimpos = fecha(m, ab)
            if fimpos >= 0:
                ini = lin(mt.start(1)) if tipo == 'method' else lin(mt.start())
                add(nome, tipo, ini, lin(fimpos))
                achados[(ini, nome)].update(a=ab, b=fimpos)
    for mt in CURTO.finditer(m):
        nome = mt.group(1)
        if nome in PALAVRAS:
            continue
        ab = mt.end() - 1
        fimpos = fecha(m, ab)
        if fimpos >= 0:
            add(nome, 'method', lin(mt.start(1)), lin(fimpos))
            achados[(lin(mt.start(1)), nome)].update(a=ab, b=fimpos)

    # pais: o menor intervalo que contem o simbolo
    itens = sorted(achados.values(), key=lambda d: (d['ini'], -d['fim']))
    for d in itens:
        d['pai'] = ''
        d['prof'] = 0
    pilha = []
    for d in itens:
        while pilha and not (pilha[-1]['ini'] <= d['ini'] and d['fim'] <= pilha[-1]['fim'] and pilha[-1] is not d):
            pilha.pop()
        if pilha:
            d['pai'] = pilha[-1]['nome']
            d['prof'] = pilha[-1]['prof'] + 1
        pilha.append(d)
    res = []
    for d in itens:
        # a funcao anonima que embrulha o arquivo (IIFE) nao entra; objetos/arrows so ate profundidade 1
        if d['prof'] > MAX_PROF_JS:
            continue
        if d['tipo'] in ('object',) and d['prof'] > 1:
            continue
        res.append([d['nome'], d['tipo'], d['ini'], d['fim'], d['pai']])
    return res


# ---------------------------------------------------------------- Python
def indexa_py(src):
    try:
        arv = ast.parse(src)
    except SyntaxError:
        return []
    res = []

    def visita(no, pai):
        for filho in ast.iter_child_nodes(no):
            if isinstance(filho, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                tipo = 'class' if isinstance(filho, ast.ClassDef) else ('method' if isinstance(no, ast.ClassDef) else 'function')
                res.append([filho.name, tipo, filho.lineno, getattr(filho, 'end_lineno', filho.lineno), pai])
                visita(filho, filho.name)
            elif isinstance(filho, ast.Assign) and isinstance(no, ast.Module):
                for alvo in filho.targets:
                    if isinstance(alvo, ast.Name) and alvo.id.isupper():
                        res.append([alvo.id, 'const', filho.lineno, getattr(filho, 'end_lineno', filho.lineno), ''])
            elif not isinstance(filho, (ast.Lambda,)):
                visita(filho, pai)

    visita(arv, '')
    res.sort(key=lambda r: r[2])
    return res


# ---------------------------------------------------------------- HTML / CSS / MD
def indexa_html(src):
    res = []
    for k, ln in enumerate(src.split('\n'), 1):
        mc = re.search(r'<!--\s*=+\s*(.*?)\s*=+\s*-->', ln)
        if mc:
            res.append([mc.group(1), 'secao', k, k, ''])
        for mt in re.finditer(r'<(section|dialog|aside|header|main|nav|form)\b[^>]*\bid="([^"]+)"', ln):
            res.append(['#' + mt.group(2), mt.group(1), k, k, ''])
        ms = re.search(r'<script[^>]*\bsrc="([^"]+)"', ln)
        if ms:
            res.append([ms.group(1), 'script', k, k, ''])
        ml = re.search(r'<link[^>]*\bhref="([^"]+\.css)"', ln)
        if ml:
            res.append([ml.group(1), 'css', k, k, ''])
    return res


def indexa_css(src):
    res = []
    for mt in re.finditer(r'/\*\s*(.+?)\s*\*/', src, re.S):
        titulo = ' '.join(mt.group(1).split())
        ini = src.count('\n', 0, mt.start()) + 1
        res.append([titulo[:90], 'secao', ini, ini, ''])
    return res


def indexa_md(src):
    res, linhas, em_codigo = [], src.split('\n'), False
    total = len(linhas)
    for k, ln in enumerate(linhas, 1):
        if ln.startswith('```'):
            em_codigo = not em_codigo
            continue
        mh = None if em_codigo else re.match(r'^(#{1,4})\s+(.*\S)\s*$', ln)
        if mh and (total <= MAX_MD_LINHAS or len(mh.group(1)) <= 2):
            res.append([mh.group(2)[:90], 'h' + str(len(mh.group(1))), k, k, ''])
    # fim de cada secao = linha anterior ao proximo titulo de nivel igual ou menor
    for i, r in enumerate(res):
        nivel = int(r[1][1])
        fim = total
        for q in res[i + 1:]:
            if int(q[1][1]) <= nivel:
                fim = q[2] - 1
                break
        r[3] = fim
    return res


INDEXADORES = {'js': indexa_js, 'py': indexa_py, 'html': indexa_html, 'css': indexa_css, 'md': indexa_md}


def varre():
    arquivos = {}
    for pasta, dirs, nomes in os.walk(RAIZ):
        dirs[:] = sorted(d for d in dirs if d not in IGNORAR_DIRS and not d.endswith('.egg-info'))
        for nome in sorted(nomes):
            ext = os.path.splitext(nome)[1].lower()
            if ext not in EXT or nome in IGNORAR_ARQ:
                continue
            cam = os.path.join(pasta, nome)
            rel = os.path.relpath(cam, RAIZ).replace(os.sep, '/')
            src = le(cam)
            lang = EXT[ext]
            try:
                simbolos = INDEXADORES[lang](src)
            except Exception as e:  # um arquivo estranho nao derruba o indice
                simbolos = []
                print('aviso: nao consegui indexar', rel, '-', e, file=sys.stderr)
            arquivos[rel] = {'lang': lang, 'linhas': src.count('\n') + 1, 'simbolos': simbolos}
    return arquivos


def formata(arquivos):
    """JSON compacto e legivel: um arquivo por bloco, um simbolo por linha."""
    por_lang = {}
    for a in arquivos.values():
        por_lang[a['lang']] = por_lang.get(a['lang'], 0) + 1
    cab = {
        'gerado_em': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'como_ler': 'simbolos = [nome, tipo, linha_inicio, linha_fim, pai]; linhas comecam em 1. Leia so a faixa necessaria (Read com offset/limit).',
        'regerar': 'python indexer.py',
        'ignorado': sorted(IGNORAR_DIRS),
        'totais': {'arquivos': len(arquivos), 'simbolos': sum(len(a['simbolos']) for a in arquivos.values()), 'por_linguagem': por_lang},
    }
    partes = ['{']
    for k, v in cab.items():
        partes.append('  %s: %s,' % (json.dumps(k), json.dumps(v, ensure_ascii=False)))
    partes.append('  "arquivos": {')
    itens = []
    for rel, a in arquivos.items():
        sim = ',\n'.join('      ' + json.dumps(s, ensure_ascii=False) for s in a['simbolos'])
        corpo = '    %s: {"lang": %s, "linhas": %d, "simbolos": [%s]}' % (
            json.dumps(rel, ensure_ascii=False), json.dumps(a['lang']), a['linhas'], ('\n' + sim + '\n    ') if sim else '')
        itens.append(corpo)
    partes.append(',\n'.join(itens))
    partes.append('  }')
    partes.append('}')
    return '\n'.join(partes) + '\n'


def sem_data(txt):
    return re.sub(r'"gerado_em": "[^"]*"', '', txt)


def main():
    arquivos = varre()
    txt = formata(arquivos)
    json.loads(txt)  # garante JSON valido
    antigo = ''
    if os.path.exists(SAIDA):
        with open(SAIDA, encoding='utf-8') as f:
            antigo = f.read()
    if '--check' in sys.argv:
        igual = sem_data(antigo) == sem_data(txt)
        print('indice atualizado' if igual else 'indice DESATUALIZADO: rode python indexer.py')
        sys.exit(0 if igual else 1)
    if sem_data(antigo) == sem_data(txt):
        print('PROJECT_INDEX.json ja estava atualizado (%d arquivos).' % len(arquivos))
        return
    with open(SAIDA, 'w', encoding='utf-8', newline='\n') as f:
        f.write(txt)
    tot = sum(len(a['simbolos']) for a in arquivos.values())
    print('PROJECT_INDEX.json gravado: %d arquivos, %d simbolos, %d bytes.' % (len(arquivos), tot, len(txt.encode('utf-8'))))


if __name__ == '__main__':
    main()
