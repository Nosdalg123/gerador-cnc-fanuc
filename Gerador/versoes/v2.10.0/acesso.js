/* Acesso por usuario: tela de entrada e menu limitado por usuario (v2.3.0).
   ATENCAO: e uma trava de uso, nao de seguranca. Quem tem os arquivos le o codigo. As senhas
   ficam so como SHA-256 (com prefixo), mas "admin", "simu" e "desenho" sao faceis de adivinhar.
   Para trocar uma senha: node -e "console.log(require('crypto').createHash('sha256').update('alumasa-cnc:NOVASENHA').digest('hex'))" */
(function () {
  'use strict';
  var K_SESSAO = 'cnc.usuario.v1', PREFIXO = 'alumasa-cnc:';
  // telas: null = todas. Chaves = telas do menu (botao nav-*)
  var USUARIOS = {
    admin:   { hash: 'cd277c6bbef2c4f0094273a47b6f5109a25786c48978050ec42399603a67ec93', telas: null },
    simu:    { hash: 'b0666239cc2df84b48f66edb2c736a0b5ad9fcc10b6a7f465cd37f18147c6792', telas: ['sim', 'ferr'] },
    desenho: { hash: '728ea43ffbe016e94cea7770d2f2067c1321f5ea9c9bf5cb2e240b08bebf6956', telas: ['desenho'] }
  };
  var BOTAO = { gerador: 'nav-gerador', desenho: 'nav-desenho', ferr: 'nav-ferr', sim: 'nav-sim', cfg: 'nav-cfg' };
  var TELAS = Object.keys(BOTAO);

  function existe(login) { return Object.prototype.hasOwnProperty.call(USUARIOS, login); }
  function telasDe(login) { return USUARIOS[login].telas || TELAS; }
  function sha256(texto) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(PREFIXO + texto)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    });
  }
  function confere(login, senha) {
    if (!existe(login)) return Promise.resolve(false);
    return sha256(senha).then(function (h) { return h === USUARIOS[login].hash; });
  }

  function aplicar(login) {
    var permitidas = telasDe(login);
    TELAS.forEach(function (tela) { document.getElementById(BOTAO[tela]).hidden = permitidas.indexOf(tela) < 0; });
    var sair = document.getElementById('nav-sair');
    sair.textContent = 'Sair (' + login + ')'; sair.hidden = false;
    document.getElementById('login').hidden = true;
    document.getElementById(BOTAO[permitidas[0]]).click();   // abre a primeira tela permitida
  }

  var form = document.getElementById('loginForm'), campoUser = document.getElementById('loginUser'), campoSenha = document.getElementById('loginSenha'), erro = document.getElementById('loginErro');
  form.onsubmit = function (ev) {
    ev.preventDefault();
    var login = campoUser.value.trim().toLowerCase();
    confere(login, campoSenha.value).then(function (ok) {
      if (!ok) { erro.textContent = 'Usuário ou senha incorretos.'; campoSenha.value = ''; campoSenha.focus(); return; }
      erro.textContent = '';
      try { sessionStorage.setItem(K_SESSAO, login); } catch (e) { /* sem storage: vale so nesta tela */ }
      aplicar(login);
    }).catch(function () {
      erro.textContent = 'Não foi possível verificar a senha neste navegador.';
    });
  };
  document.getElementById('nav-sair').onclick = function () {
    try { sessionStorage.removeItem(K_SESSAO); } catch (e) { }
    location.reload();
  };

  var logado = null;
  try { logado = sessionStorage.getItem(K_SESSAO); } catch (e) { }
  if (logado && existe(logado)) aplicar(logado);
  else campoUser.focus();
})();
