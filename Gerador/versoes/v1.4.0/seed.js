/* Ferramentas iniciais do banco (extraidas dos programas de exemplo validados).
   Sao apenas um ponto de partida: edite/cadastre as suas na aba "Ferramentas".
   seedKey identifica a ferramenta-semente: o app adiciona apenas as que o navegador ainda nao recebeu. */
window.CNC_SEED_TOOLS = [
  { seedKey: 'w0101', nome: 'W - DESBASTE EXTERNO E FACEAMENTO', t: '0101', tipo: 'externa', pastilha: '', raio: '', angulo: 80, modo: 'G96', vc: 300, rpm: 2000,
    avDesb: 0.45, avAcab: 0.15, incFace: 1, incTorn: 3, sentido: 4,
    obs: 'Valores do MATRIZ.SOLIDA validado. Completar pastilha e raio de ponta.' },
  { seedKey: 'int0606', nome: 'DESBASTE INTERNO', t: '0606', tipo: 'interna', pastilha: '', raio: '', modo: 'G96', vc: 280, rpm: 2000,
    avDesb: 0.3, avAcab: 0.2, incFace: 0, incTorn: 1, sentido: 4,
    obs: 'Valores do PORTA.MATRIZ.INTERNO validado.' },
  { seedKey: 'int0707', nome: 'DESBASTE INTERNO (ENCAIXE)', t: '0707', tipo: 'interna', pastilha: '', raio: '', modo: 'G96', vc: 300, rpm: 1000,
    avDesb: 0.5, avAcab: 0.5, incFace: 0, incTorn: 0.8, sentido: 4,
    obs: 'Valores do ALIMENTADOR.ENCAIXE.INTERNO.' },
  { seedKey: 'tmax0303', nome: 'T-MAX 42MM (FURACAO)', t: '0303', tipo: 'furacao', diametro: 42, pastilha: '', raio: '', modo: 'G97', vc: 0, rpm: 1000,
    avDesb: 0.02, avAcab: 0, incFace: 0, incTorn: 1, sentido: 3,
    obs: 'RPM fixo 1000, bicada 1 mm (G83). Valores do ALIMENTADOR.ENCAIXE.INTERNO.' },
  { seedKey: 'enc0303', nome: 'ENCAIXE 4.5 (CANAL FRONTAL)', t: '0303', tipo: 'encaixe', pastilha: '', raio: '', largura: 4.5, modo: 'G96', vc: 250, rpm: 2000,
    avDesb: 0.3, avAcab: 0.15, incFace: 0, incTorn: 0, incCanal: 1.175, sentido: 4,
    obs: 'Valores do MATRIZ.TUBULAR.ENCAIXE (Vc 250, rampa F.15, corte ate o centro F.3, camada 1.175).' }
];
