plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val kemSupabaseUrl = providers.gradleProperty("KEM_SUPABASE_URL").orElse("").get()
val kemSupabaseAnonKey = providers.gradleProperty("KEM_SUPABASE_ANON_KEY").orElse("").get()

android {
    namespace = "com.kemvpn.app"
    compileSdk = 35

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        buildConfigField("String", "SUPABASE_URL", "\"\${kemSupabaseUrl}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"\${kemSupabaseAnonKey}\"")
        applicationId = "com.kemvpn.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.2.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("com.wireguard.android:tunnel:1.0.20260102")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
