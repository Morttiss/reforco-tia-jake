# Reforço Escolar com a Tia Jake

Site estático em português com pré-matrícula conectada ao Supabase.

## Arquivos principais

- `index.html`, `styles.css`, `app.js`: site público, com formulário em etapas.
- `banner-tia-jake.jpeg`: banner enviado pela responsável.
- `privacidade.html`: informações sobre coleta, finalidade, acesso e retenção.
- `supabase/migrations/202611230001_student_enrollments.sql`: tabela privada, controle de tentativas e remoção automática de pré-matrículas após 90 dias.
- `supabase/migrations/202611230002_harden_pre_matricula_rate_limit.sql`: limite de tentativas endurecido para contar envios inválidos e impedir estouro do contador.
- `supabase/functions/pre-matricula/`: endpoint público de envio. A chave `service_role` é lida apenas pelo ambiente da Edge Function e nunca vai para o site.

## Segurança e dados

O navegador só chama a Edge Function. A tabela não concede leitura nem gravação a visitantes anônimos. A Edge Function valida origem, método, tipo e tamanho do pedido, limita tentativas por IP de entrada com HMAC, valida os campos e as autorizações e grava somente com a credencial privada do servidor. O site também aplica uma política de segurança de conteúdo. Cadastros `pre_matricula` expiram em 90 dias; a professora deve marcar matrículas confirmadas como `matriculado` no painel do Supabase. Não coloque dados de alunos neste repositório.

O formulário não envia os dados por e-mail. A responsável acompanha os registros no Table Editor do projeto Supabase. A chave pública do projeto, quando necessária ao cliente, nunca deve ser confundida com `service_role`.

## Supabase

Projeto: `reforco-tia-jake` (`zzwukucqfumnqlnzrhlf`), organização `ReforçoTiaJake`, região `sa-east-1` (São Paulo), plano Free.

1. As migrations SQL `202611230001_student_enrollments.sql` e `202611230002_harden_pre_matricula_rate_limit.sql` já foram aplicadas ao projeto.
2. A Edge Function `pre-matricula` recebe o formulário público com verificação JWT desativada, valida as chamadas no servidor e permite somente `POST` e `OPTIONS` da origem `https://morttiss.github.io`.
3. Não revele nem coloque `SUPABASE_SERVICE_ROLE_KEY` em arquivos do site, GitHub ou mensagens. O runtime do Supabase fornece essa variável à função.

## Publicação

O site pode ser publicado em GitHub Pages na raiz `https://morttiss.github.io/reforco-tia-jake/`. O código fonte e a imagem do banner são públicos se o repositório for público; os dados de matrícula ficam somente no Supabase.
