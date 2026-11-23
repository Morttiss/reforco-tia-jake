# Reforço Escolar com a Tia Jake

Site estático em português com pré-matrícula conectada ao Supabase.

## Arquivos principais

- `index.html`, `styles.css`, `app.js`: site público, com formulário em etapas.
- `banner-tia-jake.jpeg`: banner enviado pela responsável.
- `privacidade.html`: informações sobre coleta, finalidade, acesso e retenção.
- `supabase/migrations/202611230001_student_enrollments.sql`: tabela privada, controle de tentativas e remoção automática de pré-matrículas após 90 dias.
- `supabase/functions/pre-matricula/`: endpoint público de envio. A chave `service_role` é lida apenas pelo ambiente da Edge Function e nunca vai para o site.

## Segurança e dados

O navegador só chama a Edge Function. A tabela não concede leitura nem gravação a visitantes anônimos. A Edge Function valida os campos, exige autorização do responsável, verifica autorização separada quando há dados de saúde, limita tentativas por IP com um hash SHA-256 e grava somente com a credencial privada do servidor. Cadastros `pre_matricula` expiram em 90 dias; a professora deve marcar matrículas confirmadas como `matriculado` no painel do Supabase. Não coloque dados de alunos neste repositório.

O formulário não envia os dados por e-mail. A responsável acompanha os registros no Table Editor do projeto Supabase. A chave pública do projeto, quando necessária ao cliente, nunca deve ser confundida com `service_role`.

## Supabase

Projeto: `reforco-tia-jake` (`zzwukucqfumnqlnzrhlf`), organização `ReforçoTiaJake`, região `sa-east-1` (São Paulo), plano Free.

1. A migration SQL `202611230001_student_enrollments.sql` já foi aplicada ao projeto.
2. Publique a Edge Function `pre-matricula` com verificação JWT desativada, pois é o endpoint de um formulário público. A função faz suas próprias validações e somente permite `POST` e `OPTIONS` da origem `https://morttiss.github.io`.
3. Não revele nem coloque `SUPABASE_SERVICE_ROLE_KEY` em arquivos do site, GitHub ou mensagens. O runtime do Supabase fornece essa variável à função.

## Publicação

O site pode ser publicado em GitHub Pages na raiz `https://morttiss.github.io/reforco-tia-jake/`. O código fonte e a imagem do banner são públicos se o repositório for público; os dados de matrícula ficam somente no Supabase.
