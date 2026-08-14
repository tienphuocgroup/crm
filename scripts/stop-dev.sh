#!/usr/bin/env sh
# Stops only the dev servers of this repo: app 4000, api 4001, agent 2000.
set -u

for port in 4000 4001 2000; do
	pids=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
	if [ -z "$pids" ]; then
		echo "port $port: nothing listening"
		continue
	fi
	echo "port $port: killing $(echo "$pids" | tr '\n' ' ')"
	echo "$pids" | xargs kill 2>/dev/null || true
	sleep 1
	pids=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
	[ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null || true
done
