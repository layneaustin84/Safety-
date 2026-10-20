package dev.minimal.tvhome;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.TextUtils;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Ordered list of dock package names.
 *
 * <p>Sources, highest priority first: a dock.txt pushed by {@code tv.sh dock} (imported once per
 * file modification), edits made on the TV (SharedPreferences), then a default pick of common
 * streaming apps.
 */
final class DockStore {
    private static final String PREFS = "dock";
    private static final String KEY_ORDER = "order";
    private static final String KEY_IMPORTED_MTIME = "imported_mtime";
    private static final int DEFAULT_SIZE = 6;

    /** Default dock candidates in priority order; only installed ones are used. */
    private static final List<String> DEFAULTS = Arrays.asList(
            "com.netflix.ninja",
            "com.google.android.youtube.tv",
            "com.amazon.amazonvideo.livingroom",
            "com.disney.disneyplus",
            "com.wbd.stream",
            "com.apple.atve.androidtv.appletv",
            "com.plexapp.android",
            "org.jellyfin.androidtv",
            "org.xbmc.kodi",
            "com.spotify.tv.android",
            "com.android.vending",
            "com.android.tv.settings",
            "com.google.android.tvsettings");

    private final Context context;
    private final SharedPreferences prefs;

    DockStore(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Current dock, filtered to installed packages. */
    List<String> load(Set<String> installed) {
        importDockFileIfChanged();
        List<String> order;
        if (prefs.contains(KEY_ORDER)) {
            order = split(prefs.getString(KEY_ORDER, ""));
        } else {
            order = new ArrayList<>();
            for (String p : DEFAULTS) {
                if (installed.contains(p) && order.size() < DEFAULT_SIZE) order.add(p);
            }
        }
        List<String> result = new ArrayList<>();
        for (String p : order) {
            if (installed.contains(p)) result.add(p);
        }
        return result;
    }

    void save(List<String> order) {
        prefs.edit().putString(KEY_ORDER, TextUtils.join(",", order)).apply();
    }

    private void importDockFileIfChanged() {
        File dir = context.getExternalFilesDir(null);
        if (dir == null) return; // External storage unmounted.
        File file = new File(dir, "dock.txt");
        if (!file.isFile()) return;
        long mtime = file.lastModified();
        if (mtime == prefs.getLong(KEY_IMPORTED_MTIME, -1L)) return;

        Set<String> order = new LinkedHashSet<>();
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(new FileInputStream(file), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                String p = line.trim();
                if (!p.isEmpty() && !p.startsWith("#")) order.add(p);
            }
        } catch (IOException | SecurityException e) {
            return; // Keep the current dock; a later start retries the import.
        }
        prefs.edit()
                .putString(KEY_ORDER, TextUtils.join(",", order))
                .putLong(KEY_IMPORTED_MTIME, mtime)
                .apply();
    }

    private static List<String> split(String csv) {
        List<String> out = new ArrayList<>();
        if (csv == null || csv.isEmpty()) return out;
        for (String p : csv.split(",")) {
            if (!p.isEmpty()) out.add(p);
        }
        return out;
    }
}
