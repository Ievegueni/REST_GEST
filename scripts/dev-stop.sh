#!/bin/sh
# Termina TODOS os processos de desenvolvimento do RestoGest (pnpm pai, tsx watch e node filho).
# `pkill -f 'tsx watch'` não chega: o node filho fica vivo na porta 3000 e continua a escrever logs.
pids=$(ps -axo pid=,command= | grep -E 'restgest|RESTGEST' | grep -v -e grep -e dev-stop | awk '{print $1}')
[ -z "$pids" ] && { echo "Nenhum processo do RestoGest a correr."; exit 0; }
echo "$pids" | xargs kill 2>/dev/null
sleep 2
left=$(ps -axo pid=,command= | grep -E 'restgest|RESTGEST' | grep -v -e grep -e dev-stop | awk '{print $1}')
[ -n "$left" ] && echo "$left" | xargs kill -9 2>/dev/null
echo "Processos terminados."
