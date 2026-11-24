# App Android TV — ecrã de cozinha

WebView em ecrã inteiro para o `/cozinha`. Os browsers das TVs transformam as setas e o OK num
cursor de rato; esta app entrega-os à página como teclas (setas, OK = Enter, números, Voltar = Backspace).
Aparece no menu da Android TV, arranca com a TV, não deixa o ecrã apagar e o som toca sem tocar no ecrã.

## Compilar
```
cd apps/tv
./gradlew assembleDebug      # → build/outputs/apk/debug/restgest-tv-debug.apk
```
Precisa do Android SDK (Android Studio) e JDK 17+. `local.properties` com `sdk.dir=…` se o SDK não estiver em `ANDROID_HOME`.

## Instalar na TV
1. Na TV: Definições → Preferências do dispositivo → Acerca → carregar 7× em "Compilação" (opções de programador)
   → Opções de programador → **Depuração USB/rede** ligada. Ou instalar a APK por pen com um gestor de ficheiros
   (permitir "fontes desconhecidas").
2. Por rede: `adb connect <ip-da-tv>` e `adb install -r restgest-tv-debug.apk`.
3. Abrir **RestoGest Cozinha**, escrever o endereço (ex.: `https://<domínio>/cozinha?zona=Cozinha`) e entrar com o utilizador do perfil Cozinha.
4. Arrancar com a TV (Android 10+): `adb shell appops set ao.comunica.restgest.tv SYSTEM_ALERT_WINDOW allow`
   (ou Definições → Apps → RestoGest Cozinha → Mostrar sobre outras apps).

## Comando
| Tecla | Acção |
|---|---|
| ← → ↑ ↓ | mudar de talão |
| OK | avançar (Novo → Em produção → Pronto) |
| 1–9 | escolher talão |
| Voltar | recuperar o último pronto (a app não fecha; sai-se com Home) |
| Voltar longo / Menu | mudar o endereço |

APK assinada com a chave de debug: chega para instalar à mão. Para a Play Store, criar uma chave de release.
