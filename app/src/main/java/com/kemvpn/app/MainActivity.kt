package com.kemvpn.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.ClipData
import android.content.ClipboardManager
import android.content.res.Configuration
import android.content.Intent
import android.net.VpnService
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.io.BufferedReader
import java.io.StringReader
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : Activity() {
    override fun attachBaseContext(newBase: Context) {
        val language = newBase.getSharedPreferences("kem_settings", Context.MODE_PRIVATE)
            .getString("app_language", "sw") ?: "sw"
        val configuration = Configuration(newBase.resources.configuration)
        configuration.setLocale(Locale.forLanguageTag(language))
        super.attachBaseContext(newBase.createConfigurationContext(configuration))
    }

    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var backend: GoBackend
    private lateinit var configInput: EditText
    private lateinit var statusText: TextView
    private lateinit var connectButton: Button
    private lateinit var connectionMethod: TextView
    private lateinit var connectivityManager: ConnectivityManager
    private var connected = false
    private var pendingConfig: Config? = null

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = runOnUiThread { updateConnectionMethod() }
        override fun onLost(network: Network) = runOnUiThread { updateConnectionMethod() }
        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) =
            runOnUiThread { updateConnectionMethod() }
    }

    private val tunnel = object : Tunnel {
        override fun getName(): String = "kem-vpn"
        override fun onStateChange(newState: Tunnel.State) {
            runOnUiThread {
                connected = newState == Tunnel.State.UP
                statusText.text = if (connected) getString(R.string.connected) else getString(R.string.disconnected)
                connectButton.text = if (connected) getString(R.string.disconnect) else getString(R.string.connect)
                connectButton.isEnabled = true
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        backend = GoBackend(applicationContext)
        connectivityManager = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        configInput = findViewById(R.id.configInput)
        statusText = findViewById(R.id.connectionStatus)
        connectButton = findViewById(R.id.connectButton)
        connectionMethod = findViewById(R.id.connectionMethod)

        findViewById<Button>(R.id.importProfileButton).setOnClickListener { openProfileFile() }
        findViewById<Button>(R.id.languageButton).setOnClickListener { showLanguagePicker() }
        findViewById<Button>(R.id.paymentButton).setOnClickListener { showSubscriptionPicker() }
        findViewById<Button>(R.id.vpnSettingsButton).setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_VPN_SETTINGS))
            } catch (_: Exception) {
                Toast.makeText(this, R.string.vpn_settings, Toast.LENGTH_SHORT).show()
            }
        }

        updateConnectionMethod()
        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback)
        } catch (e: Exception) {
            Toast.makeText(this, e.message ?: getString(R.string.connection_failed), Toast.LENGTH_LONG).show()
        }

        connectButton.setOnClickListener {
            if (connected) disconnectVpn() else prepareAndConnect()
        }
    }


    private fun showLanguagePicker() {
        val languages = resources.getStringArray(R.array.language_names)
        val codes = arrayOf("sw", "en", "fr", "es", "pt", "ar", "hi", "zh")
        AlertDialog.Builder(this)
            .setTitle(R.string.choose_language)
            .setItems(languages) { _, which ->
                getSharedPreferences("kem_settings", Context.MODE_PRIVATE)
                    .edit().putString("app_language", codes[which]).apply()
                recreate()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun showSubscriptionPicker() {
        // Mteja huona vifurushi vyote, huchagua kimoja, kisha huchagua njia ya malipo.
        val packages = resources.getStringArray(R.array.package_options)
        AlertDialog.Builder(this)
            .setTitle(R.string.choose_package)
            .setItems(packages) { _, packageIndex ->
                val chosenPackage = packages[packageIndex]
                AlertDialog.Builder(this)
                    .setTitle(chosenPackage)
                    .setMessage(R.string.package_selected_prompt)
                    .setPositiveButton(R.string.continue_to_payment) { _, _ ->
                        showPaymentMethods(chosenPackage)
                    }
                    .setNegativeButton(android.R.string.cancel, null)
                    .show()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun showPaymentMethods(chosenPackage: String) {
        val methods = resources.getStringArray(R.array.payment_methods)
        AlertDialog.Builder(this)
            .setTitle(R.string.choose_method)
            .setItems(methods) { _, methodIndex ->
                val selected = "$chosenPackage • ${methods[methodIndex]}"
                if (methodIndex == 1) {
                    AlertDialog.Builder(this)
                        .setTitle(selected)
                        .setMessage(R.string.airtel_payment_instructions)
                        .setPositiveButton(R.string.copy_number) { _, _ ->
                            val clipboard = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("Airtel Lipa Namba", getString(R.string.airtel_lipa_number)))
                            Toast.makeText(this, R.string.number_copied, Toast.LENGTH_SHORT).show()
                        }
                        .setNegativeButton(android.R.string.ok, null)
                        .show()
                } else {
                    AlertDialog.Builder(this)
                        .setTitle(selected)
                        .setMessage(R.string.payment_pending)
                        .setPositiveButton(android.R.string.ok, null)
                        .show()
                }
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun updateConnectionMethod() {
        val capabilities = connectivityManager.getNetworkCapabilities(connectivityManager.activeNetwork)
        connectionMethod.text = when {
            capabilities == null -> getString(R.string.no_internet_transport)
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> getString(R.string.mobile_data_transport)
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> getString(R.string.wifi_transport)
            else -> getString(R.string.other_transport)
        }
    }

    private fun openProfileFile() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        startActivityForResult(intent, PROFILE_FILE_REQUEST)
    }

    private fun prepareAndConnect() {
        val raw = configInput.text.toString().trim()
        if (raw.isBlank()) {
            Toast.makeText(this, R.string.paste_config_first, Toast.LENGTH_LONG).show()
            return
        }
        if (!raw.contains("[Interface]", ignoreCase = true) || !raw.contains("[Peer]", ignoreCase = true)) {
            Toast.makeText(this, R.string.profile_format_required, Toast.LENGTH_LONG).show()
            return
        }

        val parsed = try {
            Config.parse(BufferedReader(StringReader(raw)))
        } catch (e: Exception) {
            Toast.makeText(this, getString(R.string.invalid_config, e.message ?: "Hitilafu"), Toast.LENGTH_LONG).show()
            return
        }
        pendingConfig = parsed
        val permissionIntent = VpnService.prepare(this)
        if (permissionIntent != null) {
            startActivityForResult(permissionIntent, VPN_PERMISSION_REQUEST)
        } else {
            connectWithConfig()
        }
    }

    @Deprecated("Android-compatible VPN permission result callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PROFILE_FILE_REQUEST && resultCode == RESULT_OK) {
            val uri = data?.data ?: return
            try {
                val profileText = contentResolver.openInputStream(uri)?.bufferedReader()?.use { reader ->
                    val text = reader.readText()
                    if (text.length > MAX_PROFILE_CHARS) throw IllegalArgumentException("Faili ni kubwa mno")
                    text
                } ?: throw IllegalStateException("Faili halijasomeka")
                configInput.setText(profileText)
                Toast.makeText(this, R.string.profile_imported, Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(this, getString(R.string.profile_import_failed, e.message ?: "Hitilafu"), Toast.LENGTH_LONG).show()
            }
            return
        }
        if (requestCode == VPN_PERMISSION_REQUEST) {
            if (resultCode == RESULT_OK) connectWithConfig()
            else Toast.makeText(this, R.string.vpn_permission_denied, Toast.LENGTH_LONG).show()
        }
    }

    private fun connectWithConfig() {
        val config = pendingConfig ?: return
        statusText.text = getString(R.string.connecting)
        connectButton.isEnabled = false
        executor.execute {
            try {
                backend.setState(tunnel, Tunnel.State.UP, config)
            } catch (e: Exception) {
                runOnUiThread {
                    connected = false
                    connectButton.isEnabled = true
                    statusText.text = getString(R.string.connection_failed)
                    Toast.makeText(this, e.message ?: getString(R.string.connection_failed), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun disconnectVpn() {
        connectButton.isEnabled = false
        executor.execute {
            try {
                backend.setState(tunnel, Tunnel.State.DOWN, null)
            } catch (e: Exception) {
                runOnUiThread {
                    connectButton.isEnabled = true
                    Toast.makeText(this, e.message ?: getString(R.string.connection_failed), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    override fun onDestroy() {
        try {
            connectivityManager.unregisterNetworkCallback(networkCallback)
        } catch (_: Exception) {
        }
        executor.shutdown()
        super.onDestroy()
    }

    companion object {
        private const val VPN_PERMISSION_REQUEST = 701
        private const val PROFILE_FILE_REQUEST = 702
        private const val MAX_PROFILE_CHARS = 65536
    }
}