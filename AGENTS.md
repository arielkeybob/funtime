# Continuidade do Intervalo

- Trabalhe e responda em português. Este é o app Intervalo; `balada` permanece como nome da pasta e de chaves legadas.
- Use diretamente `C:\xampp\htdocs\balada`. Confira branch, diff e estado Git antes de editar; preserve alterações do usuário. Faça commit e push quando solicitados, sem interpretar exemplos antigos de publicação como autorização atual.
- O remote esperado é `https://github.com/arielkeybob/intervalo.git`. Se ocorrer `dubious ownership`, use `git -c safe.directory=C:/xampp/htdocs/balada ...` restrito ao comando; não altere configuração global.
- Leia [README.md](README.md) para o produto, [DEVELOPMENT.md](DEVELOPMENT.md) para arquitetura/testes e [ROADMAP.md](ROADMAP.md) para ideias futuras. [CONTEXT.md](CONTEXT.md) registra a recuperação do histórico e seus limites. Confirme alegações históricas no código.
- Preserve HTML/CSS/JavaScript puro, sem build ou backend, salvo mudança de escopo solicitada. O histórico local é a fonte de verdade; cálculos usam timestamps e snapshots históricos. Preserve dados e migrações, inclusive chaves legadas.
- Mantenha a interface limpa e compacta ativada por padrão, sem ocultar erros, alertas essenciais ou o disclaimer. Use o rótulo **Exportar bebidas**. Exportar/importar bebidas e backup/restauração devem continuar visual e funcionalmente separados.
- Importar bebidas preserva o histórico. Backup inclui bebidas, histórico e preferências; exclui PIN, credenciais, bloqueio e sessão do aparelho. Preserve prévias e confirmação antes de aplicar arquivos.
- Compartilhamento entre usuários, relações entre bebidas, mesclagem e backup criptografado permanecem no roadmap, sem implementação até solicitação. O app acompanha intervalos configurados e não determina segurança para consumo.
- Para alterações de JavaScript, execute `node --check app.js` e `node --check sw.js`; complemente com testes manuais pertinentes de DEVELOPMENT.md. Relate os testes executados e os não realizados. Não apague armazenamento real para testar.
- Em releases, confira versão da aplicação, footer, documentação e cache do Service Worker; altere DATA_VERSION somente se o schema exigir. Mudanças apenas documentais não exigem nova versão. Entregue ZIP somente se pedido, com arquivos na raiz.
