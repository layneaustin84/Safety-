plugins {
    id("com.android.application")
}

// Bundle the repo's nature wallpapers (android-tv/wallpapers/*.jpg) as APK assets.
val copyWallpapers by tasks.registering(Copy::class) {
    from(rootDir.resolve("../wallpapers")) { include("*.jpg", "*.jpeg", "*.png", "*.webp") }
    into(layout.buildDirectory.dir("generated/wallpaperAssets/wallpapers"))
}

android {
    namespace = "dev.minimal.tvhome"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.minimal.tvhome"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        // Fixed, public key so every build (local or CI) can update an installed copy.
        // It protects nothing: installing over it already requires ADB access to the TV.
        create("shared") {
            storeFile = file("shared.keystore")
            storePassword = "minimaltvhome"
            keyAlias = "minimaltvhome"
            keyPassword = "minimaltvhome"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            signingConfig = signingConfigs.getByName("shared")
        }
        debug {
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/wallpaperAssets"))

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
    }
}

tasks.named("preBuild") { dependsOn(copyWallpapers) }
