# TESTES.md — Bateria de testes manuais (RestoGest)

Testes de aceitação no browser, a fazer no fim de todos os sprints.
Os testes automáticos (`pnpm test`) cobrem a lógica; aqui verifica-se o fluxo real do utilizador.

## Preparação

```sh
docker compose up -d
pnpm install
pnpm --filter @restgest/api db:deploy
pnpm --filter @restgest/api db:seed     # tenant: admin@demo.local · /admin: admin@comunica.local (senha demo1234)
pnpm --filter @restgest/api db:mock     # opcional: 100 artigos + 60 dias de movimentos no "Restaurante Demo"
pnpm dev                                # web http://localhost:5173
# no fim do teste:
pnpm dev:stop                           # termina TODOS os processos de desenvolvimento
```

- No `/admin`, colocar o tenant "Restaurante Demo" no plano **COMPLETO** para testar os módulos da Fase 2.
- Para RH/salários: criar um utilizador com o perfil **RH** e outro com o perfil **Gerente** (para confirmar que o Gerente não vê dados sensíveis).
- Marcar cada linha: ✅ ok · ❌ falhou (anotar o que aconteceu).

---

## 0–1. Login, sessão e plano
- [ ] Login com senha errada → mensagem "Email ou senha incorrectos".
- [ ] Login correcto → Painel; recarregar a página mantém a sessão.
- [ ] "Esqueci-me da senha" → mensagem genérica; em dev o link aparece no log da API; "Redefinir senha" com o link → nova senha funciona; o link não volta a funcionar.
- [ ] Sair → volta ao login; recarregar não volta a entrar.
- [ ] Definições → Plano: plano STOCK mostra RH/Salários/etc. como "Disponível no plano Completo".
- [ ] Com plano STOCK, o menu não mostra Recursos humanos; abrir `/rh` directamente não mostra conteúdo.

## 2. Super Admin (`/admin`)
- [ ] Login de Super Admin → Painel: tenants activos, no plano Completo, unidades · utilizadores, SMS/IA/importações do mês, gráfico de actividade de 30 dias, maior uso de IA e tenants recentes.
- [ ] Tenants: pesquisa por nome/NIF, filtros de plano e estado, etiquetas de plano/estado, barras de utilização quando há limite de unidades/utilizadores.
- [ ] Detalhe do tenant: mudar o plano nos cartões ou um override → aparece a barra "Tem alterações por guardar"; "Descartar" repõe; "Guardar alterações" grava.
- [ ] Criar tenant com primeiro administrador → o administrador entra na app.
- [ ] Mudar plano STOCK ↔ COMPLETO e um override (ex.: desligar Analisador IA) → o menu do tenant muda logo.
- [ ] Limites: máx. 1 unidade → criar segunda unidade no tenant dá "Limite do plano atingido".
- [ ] Suspender tenant → login do tenant bloqueado; reactivar.
- [ ] "Entrar como" → faixa amarela "Sessão de suporte"; "Terminar" volta ao /admin.

## 3. Estrutura e catálogo
- [ ] Definições → Unidades e locais: criar unidade, locais (Armazém, Bar, Cozinha), desactivar um local.
- [ ] Definições → Utilizadores: criar Ecónomo só com uma unidade → ao entrar como ele só vê essa unidade.
- [ ] Catálogo → Categorias: Bebidas > Cervejas; tentar pôr "Bebidas" dentro de "Cervejas" → recusado.
- [ ] Unidades de medida: as 7 de base existem; criar "Fardo".
- [ ] Produto com unidade de stock gf, compra cx (1 cx = 24 gf), consumo ml; mínimo/máximo no Bar.
- [ ] Fornecedor com prazo 30 dias; produtos e preços; a data do preço só muda quando o preço muda.
- [ ] Importar Excel: descarregar modelo, preencher com 1 linha errada → pré-visualização mostra o erro da linha; corrigir → importa e cria categorias em falta.

## 4. Stock
- [ ] Registar entrada de 2 cx a 4800 → Stock actual mostra 48 gf a 200 Kz.
- [ ] Quebra sem motivo → recusada; com motivo → regista.
- [ ] Ajuste (só com perfil que tenha stock.adjust).
- [ ] Kardex: saldo após cada movimento; "Estornar" pede confirmação; estorno aparece ligado.
- [ ] Produto com lote: entrada exige lote/validade; saída consome a validade mais próxima.
- [ ] Definições → Stock: "Bloquear saídas sem stock" → consumo acima do saldo é recusado.
- [ ] Tentar mudar a unidade de stock de um produto com movimentos → recusado.

## 5. Compras, transferências e inventário
- [ ] Encomenda (rascunho → enviada); recepção parcial pré-preenchida → encomenda "Parcial"; segunda recepção → "Recebida".
- [ ] Recepção com anexo PDF → "Ver factura" abre o ficheiro.
- [ ] Anular recepção → stock e custo médio voltam atrás.
- [ ] Transferência Armazém → Bar: enviar, receber com menos 1 → diferença 1 registada; cancelar uma enviada devolve o stock.
- [ ] Inventário com bloqueio: durante a contagem um consumo no local é recusado; fechar → stock acertado ao contado; linhas não contadas ficam iguais.

## 6. Fichas técnicas e importação de vendas
- [ ] Sub-receita (rende 2 kg) usada noutra ficha; % de perda; custo teórico e margem na lista.
- [ ] Ficha circular → recusada.
- [ ] Locais de saída: Bebidas → Bar; Cervejas herda.
- [ ] Perfil de importação (colunas pelo nome do cabeçalho); importar Excel → pré-visualização por artigo POS.
- [ ] Mapear artigos e "Ignorar (sem stock)"; artigo por mapear fica pendente; "Lançar pendentes" depois de mapear.
- [ ] Reimportar o mesmo ficheiro → recusado; período sobreposto → "Falhou"; anular → stock reposto e permite reimportar.

## 7. Alertas e SMS
- [ ] `/admin` → **Integrações** → Futurix SMS: colar a chave real, URL e remetente → "Guardar" → estado "Configurado"; a chave aparece só como ••••1234.
- [ ] "Enviar teste" para o próprio telemóvel → "SMS enviado"; com chave errada → "Falhou: …".
- [ ] Guardar sem preencher a chave mantém a anterior; "Remover chave" volta a "Não configurado".
- [ ] Definições → Alertas e SMS do tenant deixa de mostrar o aviso "ainda não está activo" (até 30 s depois de guardar).
- [ ] Consumo que deixa um produto abaixo do mínimo → alerta no sino em ~2 s; repor stock → alerta resolve sozinho.
- [ ] Definições → Alertas e SMS: desligar um tipo, mudar limiar de validade, destinatários por perfil.
- [ ] Horário de silêncio e resumo diário gravam.
- [ ] Registo de SMS: sem Futurix configurado aparecem como "Não enviado" com o motivo.
- [ ] Ecónomo de outra unidade não recebe alertas da primeira.

## 8. Relatórios e dashboard
- [ ] Painel mostra valor em stock, alertas, consumo/quebras/compras do mês, top consumos, últimos inventários.
- [ ] Cada relatório abre com filtros; exportar Excel e PDF de pelo menos 3 relatórios e abrir os ficheiros (acentos correctos).
- [ ] Rotação: "Só produtos parados".
- [ ] Sugestão de reposição: calcular, ajustar quantidades/fornecedor, gerar encomendas (uma por fornecedor).
- [ ] Motivos de quebra (Definições → Stock): com lista definida, a quebra só aceita motivos da lista.

## 10. RH (plano COMPLETO)
- [ ] Cargos e departamentos.
- [ ] Funcionário criado pelo perfil RH com salário, subsídio, IBAN; reabrir → IBAN visível só para RH/Administrador.
- [ ] Entrar como Gerente → ficha sem salário/IBAN/documentos; lista sem coluna de salário.
- [ ] Documento do funcionário (upload PDF) e abrir.
- [ ] Escala semanal: "08:00-16:00" em vários dias; formato errado → mensagem; semana seguinte/anterior.
- [ ] Presenças do dia: sugere Presente para quem tem turno e Licença para quem está de férias; gravar horas extra; resumo do mês actualiza.
- [ ] Férias: pedido de 10 dias úteis; pedido sobreposto → recusado; aprovar acima do saldo → recusado; saldo na ficha.

## 11. Salários (plano COMPLETO)
Preparação: no `/admin` → **Tabelas IRT/INSS**, criar uma tabela com os valores **da legislação em vigor** (validar com um técnico de contas). Sem tabela, o processamento recusa-se.
- [ ] Tabela com dois escalões sem limite superior → recusada.
- [ ] Definições → Salários: sem parâmetros, "Processar salários" dá mensagem a pedir para configurar; preencher horas semanais, multiplicador das horas extra e dias do mês.
- [ ] Ficha do funcionário (perfil RH): subsídio com "Sujeito a INSS" desligado e "Isento de IRT até"; adiantamento de 60 000 em 2 prestações.
- [ ] Presenças: horas extra e faltas injustificadas no mês.
- [ ] Salários → processar a unidade/mês → conferir à mão uma linha: base, subsídios, horas extra, faltas, bruto, INSS (só parte sujeita), IRT (escalão certo), desconto da prestação, líquido.
- [ ] Funcionário admitido a meio do mês → salário base proporcional.
- [ ] Recalcular enquanto rascunho; "Apagar rascunho".
- [ ] Utilizador sem `payroll.approve` não vê "Aprovar"; aprovar com perfil próprio → adiantamento fica com metade em dívida; recalcular deixa de ser possível.
- [ ] "Marcar como pago".
- [ ] Recibos (PDF): um por página, com NIF/INSS do funcionário e assinaturas. Mapa (Excel) com totais.
- [ ] Alterar no `/admin` uma tabela já usada em salários aprovados → recusado ("crie uma nova versão").

## 12. Custos diários e fecho de caixa (plano COMPLETO)
Preparação: Definições → Caixa: criar meios de pagamento (Numerário marcado como numerário, TPA, Multicaixa Express, Transferência) e o limite de diferença; Custos → Categorias: criar algumas categorias.
- [ ] Custos diários: registar custo com comprovativo (PDF/imagem) → "ver" abre o ficheiro; total do mês; apagar.
- [ ] Recorrentes: renda no dia 5 → "Gerar em atraso" cria o custo uma só vez no mês (carregar duas vezes).
- [ ] Caixa: abrir sessão com fundo de 20 000; abrir outra para o mesmo dia/turno → recusado.
- [ ] Valores do sistema por meio de pagamento; sangria, entrada e pagamento pela caixa (com categoria) → o pagamento aparece em Custos diários como "pago pela caixa" e não se apaga lá.
- [ ] Contagem por notas → "Usar total como numerário contado".
- [ ] Numerário esperado = fundo + vendas em numerário + entradas − sangrias − pagamentos (conferir à mão).
- [ ] Fechar com diferença acima do limite sem justificação → recusado; com justificação → fecha e aparece alerta "Diferença de caixa" no sino.
- [ ] Utilizador com perfil Caixa não consegue validar; Gerente valida → sessão validada sem botões de edição; reabrir deixa de ser possível.
- [ ] Gerente reabre uma sessão fechada (não validada) → volta a editável.
- [ ] Importação dos pagamentos do POS: **pendente** (ficheiro Winrest).

## 13. Contas a pagar (plano COMPLETO)
- [ ] Fornecedor com prazo de 30 dias; registar uma recepção com data de factura → em Contas a pagar aparece a conta com vencimento = data da factura + 30 dias.
- [ ] No plano STOCK, recepções não geram contas a pagar.
- [ ] Pagamento parcial com comprovativo → estado "Parcial"; pagamento acima do saldo → recusado; pagamento do resto → "Paga".
- [ ] Anular a recepção de uma conta com pagamentos → recusado; apagar os pagamentos e anular → conta "Cancelada".
- [ ] Conta manual sem vencimento → usa o prazo do fornecedor; cancelar conta manual.
- [ ] Lista: filtro "Só em aberto", por fornecedor; vencidas a vermelho; total em dívida.
- [ ] Alertas: conta a vencer dentro do limiar e conta vencida aparecem no sino (varrimento a cada 30 min, ou "Verificar agora" em Alertas); pagar → alerta resolve.
- [ ] Relatórios "Contas a pagar: antiguidade" (colunas não vencido / 0–30 / 31–60 / 61–90 / +90) e "Previsão de pagamentos" por semana; exportar Excel/PDF.

## 14. Resultados financeiros (plano COMPLETO)
Preparação: ter no mesmo mês vendas importadas e confirmadas, quebras, custos diários e salários aprovados.
- [ ] Resultados: período = mês → Receita, CMV vendas, Quebras, Custos operacionais, Custo de pessoal e Resultado batem com os módulos de origem (conferir 1–2 valores à mão).
- [ ] CMV %, Pessoal % e ponto de equilíbrio coerentes; variação vs. período anterior.
- [ ] Tabela por unidade + total; trocar a unidade no topo filtra tudo.
- [ ] Gráfico diário: barras de receita e de resultado (negativo a vermelho); passar o rato mostra os valores.
- [ ] Exportar Excel por dia / por mês / por unidade e PDF; abrir os ficheiros.
- [ ] Período de 1 dia: o custo de pessoal aparece rateado (salário do mês ÷ dias do mês).
- [ ] Ticket médio: **pendente** (o ficheiro do POS ainda não traz o nº de documentos).

## 15. Analisador IA (plano COMPLETO)
Preparação: `ANTHROPIC_API_KEY` no `.env` da API (opcional `ANTHROPIC_MODEL`, por defeito `claude-opus-5`); reiniciar a API. Ter dados de stock, vendas, quebras e custos.
- [ ] Sem chave: a página Analisador IA mostra o aviso "ainda não está configurado"; perguntar dá erro.
- [ ] Plano STOCK ou override "Analisador IA" desligado → o menu não mostra Analisador IA.
- [ ] Perfil sem `ai.use` (ex.: Ecónomo) → "Sem permissão".
- [ ] Perguntar "Quanto gastámos em bebidas este mês?" → resposta em Kz com período e unidade; conferir o valor no relatório Consumo (categoria Bebidas).
- [ ] Pergunta de evolução/comparação ("compara as quebras por semana") → aparece um gráfico; passar o rato nas barras mostra valores.
- [ ] Pergunta de seguimento na mesma conversa ("e no mês passado?") usa o contexto anterior; "Nova conversa" limpa.
- [ ] Utilizador com acesso só a uma unidade, pergunta pela outra → a IA diz que não tem acesso a esses dados.
- [ ] Pergunta sem dados (ex.: período sem vendas) → a IA diz que não há dados suficientes, sem inventar números.
- [ ] Contador "N / limite pedidos este mês" aumenta; no `/admin` definir limite IA = pedidos já feitos → nova pergunta dá "Limite mensal … atingido".
- [ ] `/admin` → tenant → "Uso este mês": pedidos IA, tokens e custo estimado (USD); SMS enviados e importações.

## 16. Analisador IA — anomalias, previsão e relatório semanal (plano COMPLETO)
Preparação: um mês de dados numa unidade (custos diários, vendas importadas ou quebras) e, ontem, um valor muito acima do habitual (ex.: custo diário 5× maior).
- [ ] Definições → Alertas: aparece "Anomalia detectada (IA)" com limiar 3 (z-score); alterar e gravar.
- [ ] Analisador IA → Relatórios automáticos → "Verificar anomalias de ontem" (perfil com Definições) → relatório da unidade com a métrica anómala, valor e média; alerta no sino.
- [ ] Sem chave da Anthropic: o relatório de anomalias é gerado na mesma, com a lista simples; com chave: texto explicado e priorizado pela IA.
- [ ] Carregar outra vez → não duplica o relatório nem o alerta.
- [ ] Desligar a regra "Anomalia detectada (IA)" → verificar não gera nada.
- [ ] "Gerar relatório da semana passada" (precisa de chave) → um relatório por unidade com Resumo, Números, Pontos de atenção e Recomendações; notificação "Relatório semanal IA" no sino.
- [ ] Abrir relatório → "PDF" descarrega e abre com acentos correctos.
- [ ] Utilizador só com acesso a uma unidade não vê relatórios das outras.
- [ ] Chat: "Quanto devo encomendar para o Bar para os próximos 7 dias?" → resposta com base na previsão (consumo previsto, stock, pendentes).
- [ ] Em produção (`RUN_WORKERS=true`): anomalias correm às 06:30 todos os dias e o relatório semanal às segundas às 07:00 (hora de Luanda); cada execução conta para o limite mensal de pedidos IA.

## 9. Deploy (na VPS, seguindo `deploy/DEPLOY.md`)
- [ ] `pnpm build` sem erros; `pm2 status` com `restgest-api` e `restgest-worker` online.
- [ ] `https://<domínio>/api/health` → ok; HTTP redirecciona para HTTPS; recarregar uma rota interna (ex.: `/stock`) não dá 404.
- [ ] Upload de anexo de 5 MB funciona; 6 MB → recusado com mensagem.
- [ ] 11 tentativas de login erradas num minuto → "demasiados pedidos" só para esse IP (outro dispositivo continua a entrar).
- [ ] `backup.sh` corrido à mão cria o `.dump` e copia para o remoto; restaurar numa base de teste e abrir a app contra ela.
- [ ] Portas 5432/6379 não acessíveis de fora da VPS.

