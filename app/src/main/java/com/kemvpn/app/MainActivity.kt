package com.kemvpn.app

import android.app.Activity
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.Toast

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        val status = findViewById<TextView>(R.id.connectionStatus)
        val connectButton = findViewById<Button>(R.id.connectButton)
        connectButton.setOnClickListener {
            status.text = getString(R.string.server_not_configured)
            Toast.makeText(this, R.string.setup_required, Toast.LENGTH_LONG).show()
        }
    }
}
