package com.kemvpn.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

class WebPortalActivity : Activity() {
    private lateinit var webView: WebView
    private val preferences by lazy { getSharedPreferences("kem_web_portal", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF071827.toInt())
        }
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(12, 8, 12, 8)
        }
        val title = TextView(this).apply {
            text = if (intent.getStringExtra("portal") == "admin") "KEM VPN • ADMIN" else "KEM VPN • AKAUNTI"
            textSize = 16f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(8, 8, 8, 8)
        }
        val serverButton = Button(this).apply {
            text = "Seva"
            setOnClickListener { showServerDialog(true) }
        }
        toolbar.addView(title, LinearLayout.LayoutParams(0, -2, 1f))
        toolbar.addView(serverButton)
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = false
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun apiBaseUrl(): String = preferences.getString("api_base_url", "") ?: ""
        }, "KemConfig")
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("file:///android_asset/kem/")) return false
                if (url.startsWith("https://")) startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                return true
            }
        }
        root.addView(toolbar)
        root.addView(webView, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        if ((preferences.getString("api_base_url", "") ?: "").isBlank()) showServerDialog(false) else loadPortal()
    }

    private fun showServerDialog(canCancel: Boolean) {
        val field = EditText(this).apply {
            hint = "https://api.example.com"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            setText(preferences.getString("api_base_url", ""))
            setPadding(28, 18, 28, 18)
        }
        AlertDialog.Builder(this)
            .setTitle("Anwani ya seva ya KEM VPN")
            .setMessage("Weka HTTPS URL ya membership backend. Bila server iliyowekwa mtandaoni, ukurasa utaonekana lakini akaunti, vifurushi na admin hazitaweza kupata data.")
            .setView(field)
            .setPositiveButton("Hifadhi") { _, _ ->
                val value = field.text.toString().trim().trimEnd('/')
                if (!value.startsWith("https://")) {
                    Toast.makeText(this, "Tumia HTTPS URL salama ya seva.", Toast.LENGTH_LONG).show()
                    showServerDialog(canCancel)
                } else {
                    preferences.edit().putString("api_base_url", value).apply()
                    loadPortal()
                }
            }
            .apply {
                if (canCancel) setNegativeButton("Ghairi", null)
                else setNegativeButton("Endelea bila seva") { _, _ -> loadPortal() }
            }
            .show()
    }

    private fun loadPortal() {
        val page = if (intent.getStringExtra("portal") == "admin") "admin.html" else "index.html"
        webView.loadUrl("file:///android_asset/kem/$page")
    }

    @Deprecated("Deprecated in Android 13")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }
}