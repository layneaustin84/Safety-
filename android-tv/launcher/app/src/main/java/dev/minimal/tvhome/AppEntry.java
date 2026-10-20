package dev.minimal.tvhome;

import android.content.Intent;
import android.graphics.drawable.Drawable;

/** One launchable app. Drawables are loaded once off the main thread. */
final class AppEntry {
    final String packageName;
    final String label;
    final Intent launchIntent;
    /** 16:9 TV banner, or null when the app only ships a square icon. */
    final Drawable banner;
    final Drawable icon;

    AppEntry(String packageName, String label, Intent launchIntent, Drawable banner, Drawable icon) {
        this.packageName = packageName;
        this.label = label;
        this.launchIntent = launchIntent;
        this.banner = banner;
        this.icon = icon;
    }
}
