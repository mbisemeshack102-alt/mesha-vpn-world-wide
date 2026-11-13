package com.kemvpn.app

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import com.wireguard.android.backend.GoBackend
import com.wireguard.android.backend.Tunnel
import com.wireguard.config.Config
import java.io.BufferedReader
import java.io.StringReader
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var backend: GoBackend
    private lateinit var configInput: EditText
    private lateinit var statusText: TextView
    private lateinit var connectButton: Button
    private lateinit var connectionMethod: TextView
    private var connected = false
    private var pendingConfig: Config? = null

    private val tunnel = object : Tunnel {
        override fun getName(): String = "kem-vpn"
        override fun onStateChange(newState: Tunnel.State) {
            runOnUiThread {
                connected = newState == Tunnel.State.UP
                statusText.text = if (connected) getString(R.string.connected) else getString(R.string.disconnected)
                connectButton.text = if (connected) getString(R.string.disconnect) else getString(R.string.connect)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        backend = GoBackend(applicationContext)
        configInput = findViewById(R.id.configInput)
        statusText = findViewById(R.id.connectionStatus)
        connectButton = findViewById(R.id.connectButton)
        findViewById<Button>(R.id.importProfileButton).setOnClickListener { openProfileFile() }
        connectionMethod = findViewById(R.id.connectionMethod)
        updateConnectionMethod()
        val connectivity = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        connectivity.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: android.net.Network) = runOnUiThread { updateConnectionMethod() }
            override fun onLost(network: android.net.Network) = runOnUiThread { updateConnectionMethod() }
            override fun onCapabilitiesChanged(network: android.net.Network, capabilities: NetworkCapabilities) = runOnUiThread { updateConnectionMethod() }
        })

        connectButton.setOnClickListener {
            if (connected) disconnectVpn() else prepareAndConnect()
        }
    }

    private fun updateConnectionMethod() {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val capabilities = cm.getNetworkCapabilities(cm.activeNetwork)
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
        @Suppress("DEPRECATION")
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
            Toast.makeText(this, getString(R.string.invalid_config, e.message ?: "Unknown error"), Toast.LENGTH_LONG).show()
            return
        }
        pendingConfig = parsed

        val permissionIntent = VpnService.prepare(this)
        if (permissionIntent != null) {
            @Suppress("DEPRECATION")
            startActivityForResult(permissionIntent, VPN_PERMISSION_REQUEST)
        } else {
            connectWithConfig()
        }
    }

    @Deprecated("Uses Android's compatible VPN permission result callback")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PROFILE_FILE_REQUEST && resultCode == RESULT_OK) {
            val uri = data?.data ?: return
            try {
                val profileText = contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                    ?: throw IllegalStateException("Could not read selected file")
                if (profileText.length > 65536) throw IllegalArgumentException("Profile file is too large")
                configInput.setText(profileText)
                Toast.makeText(this, R.string.profile_imported, Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(this, getString(R.string.profile_import_failed, e.message ?: "Unknown error"), Toast.LENGTH_LONG).show()
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
                runOnUiThread {
                    connectButton.isEnabled = true
                    statusText.text = getString(R.string.connected)
                    connected = true
                    connectButton.text = getString(R.string.disconnect)
                }
            } catch (e: Exception) {
                runOnUiThread {
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
                runOnUiThread {
                    connected = false
                    connectButton.isEnabled = true
                    connectButton.text = getString(R.string.connect)
                    statusText.text = getString(R.string.disconnected)
                }
            } catch (e: Exception) {
                runOnUiThread {
                    connectButton.isEnabled = true
                    Toast.makeText(this, e.message ?: getString(R.string.connection_failed), Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }

    companion object {
        private const val VPN_PERMISSION_REQUEST = 701
        private const val PROFILE_FILE_REQUEST = 702
    }
}
