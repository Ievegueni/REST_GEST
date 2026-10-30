# TESTES.md — Bateria de testes manuais (RestoGest)

Testes de aceitação no browser, a fazer no fim de todos os sprints.
Os testes automáticos (`pnpm test`) cobrem a lógica; aqui verifica-se o fluxo real do utilizador.

## Preparação

```sh
docker compose up -d
pnpm install
pnpm --filter @restgest/api db:deploy
pnpm --filter @restgest/api db:seed     # tenant: admin@demo.local · /admin: admin@comunica.local (senha demo1234)
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
- [ ] Login de Super Admin; lista de tenants com unidades/utilizadores.
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
