package dev.minimal.tvhome;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.drawable.Drawable;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Enumerates launchable apps. Call from a background thread: loading banners is I/O. */
final class AppRepository {

    private AppRepository() {}

    static List<AppEntry> load(Context context) {
        PackageManager pm = context.getPackageManager();
        String self = context.getPackageName();
        // TV-native entries first so their banner/intent wins over the phone LAUNCHER entry.
        Map<String, AppEntry> byPackage = new LinkedHashMap<>();
        collect(pm, Intent.CATEGORY_LEANBACK_LAUNCHER, self, byPackage);
        collect(pm, Intent.CATEGORY_LAUNCHER, self, byPackage);

        List<AppEntry> apps = new ArrayList<>(byPackage.values());
        Collator collator = Collator.getInstance(Locale.getDefault());
        collator.setStrength(Collator.PRIMARY);
        // Collections.sort, not List.sort: the latter needs API 24 and minSdk is 21.
        Collections.sort(apps, (a, b) -> collator.compare(a.label, b.label));
        return apps;
    }

    private static void collect(PackageManager pm, String category, String self, Map<String, AppEntry> out) {
        Intent query = new Intent(Intent.ACTION_MAIN).addCategory(category);
        List<ResolveInfo> infos;
        try {
            infos = pm.queryIntentActivities(query, 0);
        } catch (RuntimeException e) {
            // Binder transaction too large on devices with hundreds of apps; skip this category.
            return;
        }
        for (ResolveInfo info : infos) {
            ActivityInfo ai = info.activityInfo;
            if (ai == null || self.equals(ai.packageName) || out.containsKey(ai.packageName)) {
                continue;
            }
            Intent launch = new Intent(Intent.ACTION_MAIN)
                    .addCategory(category)
                    .setComponent(new ComponentName(ai.packageName, ai.name))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            CharSequence label = info.loadLabel(pm);
            out.put(ai.packageName, new AppEntry(
                    ai.packageName,
                    label != null ? label.toString() : ai.packageName,
                    launch,
                    loadBanner(pm, ai),
                    info.loadIcon(pm)));
        }
    }

    private static Drawable loadBanner(PackageManager pm, ActivityInfo ai) {
        try {
            Drawable banner = ai.loadBanner(pm);
            return banner != null ? banner : ai.applicationInfo.loadBanner(pm);
        } catch (RuntimeException e) {
            // Malformed resources in a third-party APK must not take the home screen down.
            return null;
        }
    }
}
