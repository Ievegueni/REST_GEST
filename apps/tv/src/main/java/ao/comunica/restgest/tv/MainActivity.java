package ao.comunica.restgest.tv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

/**
 * Ecrã de cozinha numa Android TV: WebView em ecrã inteiro que passa as teclas do comando
 * à página (setas, OK = Enter, números). O browser da TV transforma-as num cursor de rato.
 *
 * Comando: Voltar = Backspace (recuperar o último pronto) · Voltar longo ou Menu = mudar o endereço.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "tv";
    private static final String KEY_URL = "url";
    private static final long RETRY_MS = 10_000;

    private WebView web;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean backLong;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // som do talão novo sem tocar no ecrã
        CookieManager.getInstance().setAcceptCookie(true);
        web.clearCache(true); // depois de um deploy abre sempre a versão nova do ecrã
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                // TV ligada antes da rede: tenta outra vez
                if (req.isForMainFrame()) handler.postDelayed(MainActivity.this::load, RETRY_MS);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                CookieManager.getInstance().flush(); // sessão sobrevive a desligar a TV
            }
        });
        setContentView(web);
        web.requestFocus();

        if (url().isEmpty()) askUrl();
        else load();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    private String url() {
        return getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_URL, "");
    }

    private void load() {
        handler.removeCallbacksAndMessages(null);
        if (!url().isEmpty()) web.loadUrl(url());
    }

    private void askUrl() {
        EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint(R.string.url_hint);
        input.setText(url());
        new AlertDialog.Builder(this)
                .setTitle(R.string.url_title)
                .setView(input)
                .setPositiveButton(R.string.save, (d, w) -> {
                    String u = input.getText().toString().trim();
                    if (!u.isEmpty() && !u.contains("://")) u = "https://" + u;
                    SharedPreferences.Editor e = getSharedPreferences(PREFS, MODE_PRIVATE).edit();
                    e.putString(KEY_URL, u).apply();
                    load();
                })
                .show();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SETTINGS) {
            if (e.getAction() == KeyEvent.ACTION_UP) askUrl();
            return true;
        }
        if (code == KeyEvent.KEYCODE_BACK) {
            // a app não fecha com Voltar (sai-se com Home); curto = Backspace, longo = endereço
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) backLong = false;
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() >= 10 && !backLong) {
                backLong = true;
                askUrl();
            }
            if (e.getAction() == KeyEvent.ACTION_UP && !backLong) sendKey("Backspace");
            return true;
        }
        // o Android usa o D-pad para mover o foco e não o entrega à página: no ecrã de cozinha
        // envia-o como tecla; noutras páginas (login) fica a navegação normal
        String key = dpadKey(code);
        String page = web.getUrl();
        if (key != null && page != null && page.contains("/cozinha")) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) sendKey(key);
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    private static String dpadKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_LEFT: return "ArrowLeft";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "ArrowRight";
            case KeyEvent.KEYCODE_DPAD_UP: return "ArrowUp";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "ArrowDown";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER: return "Enter";
            default: return null;
        }
    }

    private void sendKey(String key) {
        web.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown',{key:'" + key + "'}))", null);
    }
}
