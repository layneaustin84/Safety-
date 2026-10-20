package dev.minimal.tvhome;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextClock;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Apple TV-style home: full-screen rotating wallpaper, clock, a dock of favourite apps and an
 * "All apps" panel (D-pad down). Built from framework views only: no AndroidX, no Compose, so the
 * APK stays small and cold start is fast on low-end TV SoCs.
 */
public final class HomeActivity extends Activity {
    private static final int GRID_COLUMNS = 6;
    private static final float FOCUS_SCALE = 1.12f;
    private static final int TILE_BG = 0xFF2A2A2E;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Map<String, AppEntry> appsByPackage = new HashMap<>();
    private final List<AppEntry> apps = new ArrayList<>();
    private List<String> dock = new ArrayList<>();

    private DockStore dockStore;
    private WallpaperRotator wallpapers;
    private LinearLayout homeContent;
    private LinearLayout dockRow;
    private FrameLayout appsPanel;
    private GridLayout appsGrid;
    private boolean receiverRegistered;
    /** Package whose dock tile should take focus after the next dock rebuild. */
    private String focusAfterRebuild;

    private final BroadcastReceiver packageReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            reloadApps();
        }
    };

    // ------------------------------------------------------------ lifecycle

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        dockStore = new DockStore(this);
        setContentView(buildLayout());

        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_PACKAGE_ADDED);
        filter.addAction(Intent.ACTION_PACKAGE_REMOVED);
        filter.addAction(Intent.ACTION_PACKAGE_CHANGED);
        filter.addAction(Intent.ACTION_PACKAGE_REPLACED);
        filter.addDataScheme("package");
        if (Build.VERSION.SDK_INT >= 33) {
            // Package broadcasts are protected (system-only senders), so exporting is safe.
            registerReceiver(packageReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            registerReceiver(packageReceiver, filter);
        }
        receiverRegistered = true;
        reloadApps();
    }

    @Override
    protected void onStart() {
        super.onStart();
        wallpapers.start();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Picks up a dock.txt pushed by tv.sh while we were in the background.
        if (!apps.isEmpty()) rebuildDock();
    }

    @Override
    protected void onStop() {
        wallpapers.stop();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        if (receiverRegistered) unregisterReceiver(packageReceiver);
        io.shutdownNow();
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // HOME pressed while already home: return to the dock, like Apple TV.
        hideApps();
        focusDock(0);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            // A launcher must never finish on BACK; it only closes the apps panel.
            if (event.getAction() == KeyEvent.ACTION_UP && isAppsVisible()) hideApps();
            return true;
        }
        return super.dispatchKeyEvent(event);
    }

    // ------------------------------------------------------------ layout

    private View buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        FrameLayout wallpaperFrame = new FrameLayout(this);
        ImageView a = wallpaperView();
        ImageView b = wallpaperView();
        wallpaperFrame.addView(a, match());
        wallpaperFrame.addView(b, match());
        root.addView(wallpaperFrame, match());
        wallpapers = new WallpaperRotator(this, io, a, b);

        View scrim = new View(this);
        scrim.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] {0x55000000, 0x00000000, 0x00000000, 0xCC000000}));
        root.addView(scrim, match());

        root.addView(buildClock(), new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.TOP | Gravity.END));

        homeContent = new LinearLayout(this);
        homeContent.setOrientation(LinearLayout.VERTICAL);
        homeContent.setGravity(Gravity.BOTTOM);
        noClip(homeContent);
        homeContent.setPadding(0, 0, 0, dp(40));

        HorizontalScrollView dockScroll = new HorizontalScrollView(this);
        dockScroll.setHorizontalScrollBarEnabled(false);
        dockScroll.setFillViewport(true);
        noClip(dockScroll);
        dockRow = new LinearLayout(this);
        dockRow.setOrientation(LinearLayout.HORIZONTAL);
        dockRow.setGravity(Gravity.CENTER_HORIZONTAL);
        dockRow.setPadding(dp(56), dp(24), dp(56), dp(8));
        noClip(dockRow);
        dockScroll.addView(dockRow, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        homeContent.addView(dockScroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView hint = text("▾  All apps", 13, 0x99FFFFFF);
        hint.setGravity(Gravity.CENTER_HORIZONTAL);
        homeContent.addView(hint, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(homeContent, match());

        root.addView(buildAppsPanel(), match());
        return root;
    }

    private View buildClock() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.END);
        box.setPadding(dp(56), dp(36), dp(56), 0);

        TextClock time = new TextClock(this);
        time.setFormat12Hour("h:mm");
        time.setFormat24Hour("HH:mm");
        styleText(time, 44, Color.WHITE);
        time.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));

        TextClock date = new TextClock(this);
        date.setFormat12Hour("EEEE, MMMM d");
        date.setFormat24Hour("EEEE, d MMMM");
        styleText(date, 16, 0xDDFFFFFF);

        box.addView(time);
        box.addView(date);
        return box;
    }

    private View buildAppsPanel() {
        appsPanel = new FrameLayout(this);
        appsPanel.setBackgroundColor(0xE60B0B0D);
        appsPanel.setVisibility(View.GONE);

        ScrollView scroll = new ScrollView(this);
        scroll.setVerticalScrollBarEnabled(false);
        noClip(scroll);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setPadding(dp(56), dp(40), dp(56), dp(56));
        noClip(column);

        TextView title = text("Apps", 28, Color.WHITE);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        title.setPadding(dp(8), 0, 0, dp(16));
        column.addView(title);

        appsGrid = new GridLayout(this);
        appsGrid.setColumnCount(GRID_COLUMNS);
        noClip(appsGrid);
        column.addView(appsGrid, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        scroll.addView(column);
        appsPanel.addView(scroll, match());
        return appsPanel;
    }

    // ------------------------------------------------------------ data

    private void reloadApps() {
        io.execute(() -> {
            List<AppEntry> loaded = AppRepository.load(getApplicationContext());
            runOnUiThread(() -> {
                if (isDestroyed()) return;
                apps.clear();
                apps.addAll(loaded);
                appsByPackage.clear();
                for (AppEntry e : loaded) appsByPackage.put(e.packageName, e);
                boolean hadFocus = dockRow.hasFocus();
                rebuildDock();
                rebuildGrid();
                if (!hadFocus && !isAppsVisible()) focusDock(0);
            });
        });
    }

    private void rebuildDock() {
        int focusedIndex = indexOfFocusedChild(dockRow);
        dock = dockStore.load(appsByPackage.keySet());
        dockRow.removeAllViews();
        int width = dp(208);
        for (int i = 0; i < dock.size(); i++) {
            AppEntry e = appsByPackage.get(dock.get(i));
            if (e == null) continue;
            dockRow.addView(dockTile(e, width), tileParams(width, dp(14)));
        }
        View all = tile(null, "All Apps", width, true);
        all.setOnClickListener(v -> showApps());
        all.setOnKeyListener(this::dockKey);
        dockRow.addView(all, tileParams(width, dp(14)));

        if (focusAfterRebuild != null) {
            int idx = dock.indexOf(focusAfterRebuild);
            focusAfterRebuild = null;
            focusDock(Math.max(idx, 0));
        } else if (focusedIndex >= 0) {
            focusDock(Math.min(focusedIndex, dockRow.getChildCount() - 1));
        }
    }

    private void rebuildGrid() {
        appsGrid.removeAllViews();
        int usable = getResources().getDisplayMetrics().widthPixels - dp(112);
        int cell = usable / GRID_COLUMNS;
        int width = cell - dp(20);
        for (int i = 0; i < apps.size(); i++) {
            AppEntry e = apps.get(i);
            View t = tile(e, e.label, width, false);
            final int index = i;
            t.setOnClickListener(v -> launch(e));
            t.setOnLongClickListener(v -> { showOptions(e, false); return true; });
            t.setOnKeyListener((v, keyCode, event) -> gridKey(index, e, keyCode, event));
            GridLayout.LayoutParams lp = new GridLayout.LayoutParams();
            lp.width = width;
            lp.setMargins(dp(10), dp(10), dp(10), dp(18));
            appsGrid.addView(t, lp);
        }
    }

    // ------------------------------------------------------------ tiles

    private View dockTile(AppEntry e, int width) {
        View t = tile(e, e.label, width, true);
        t.setOnClickListener(v -> launch(e));
        t.setOnLongClickListener(v -> { showOptions(e, true); return true; });
        t.setOnKeyListener((v, keyCode, event) -> {
            if (keyCode == KeyEvent.KEYCODE_MENU && event.getAction() == KeyEvent.ACTION_UP) {
                showOptions(e, true);
                return true;
            }
            return dockKey(v, keyCode, event);
        });
        return t;
    }

    private boolean dockKey(View v, int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN && event.getAction() == KeyEvent.ACTION_DOWN) {
            showApps();
            return true;
        }
        return false;
    }

    private boolean gridKey(int index, AppEntry e, int keyCode, KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_UP && keyCode == KeyEvent.KEYCODE_MENU) {
            showOptions(e, false);
            return true;
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN && keyCode == KeyEvent.KEYCODE_DPAD_UP
                && index < GRID_COLUMNS) {
            hideApps();
            focusDock(0);
            return true;
        }
        return false;
    }

    /**
     * A focusable card with a 16:9 artwork area and a caption. Dock captions appear only on
     * focus (Apple TV top row); grid captions are always visible.
     */
    private View tile(AppEntry e, String caption, int width, boolean captionOnFocus) {
        LinearLayout tile = new LinearLayout(this);
        tile.setOrientation(LinearLayout.VERTICAL);
        tile.setFocusable(true);
        tile.setClickable(true);
        tile.setLongClickable(true);
        if (Build.VERSION.SDK_INT >= 26) tile.setDefaultFocusHighlightEnabled(false);

        FrameLayout card = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(TILE_BG);
        bg.setCornerRadius(dp(12));
        card.setBackground(bg);
        card.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
        card.setClipToOutline(true);
        card.setElevation(dp(4));

        ImageView art = new ImageView(this);
        if (e != null && e.banner != null) {
            art.setScaleType(ImageView.ScaleType.CENTER_CROP);
            art.setImageDrawable(e.banner);
            card.addView(art, match());
        } else {
            art.setScaleType(ImageView.ScaleType.FIT_CENTER);
            if (e != null) {
                art.setImageDrawable(e.icon);
            } else {
                art.setImageResource(android.R.drawable.ic_dialog_dialer);
                art.setColorFilter(Color.WHITE);
            }
            int size = width * 9 / 16 / 2;
            card.addView(art, new FrameLayout.LayoutParams(size, size, Gravity.CENTER));
        }
        tile.addView(card, new LinearLayout.LayoutParams(width, width * 9 / 16));

        TextView label = text(caption, 14, Color.WHITE);
        label.setSingleLine(true);
        label.setEllipsize(android.text.TextUtils.TruncateAt.END);
        label.setGravity(Gravity.CENTER_HORIZONTAL);
        label.setPadding(0, dp(10), 0, 0);
        label.setShadowLayer(dp(4), 0, dp(1), 0xAA000000);
        if (captionOnFocus) label.setAlpha(0f);
        tile.addView(label, new LinearLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT));

        tile.setOnFocusChangeListener((v, hasFocus) -> {
            float s = hasFocus ? FOCUS_SCALE : 1f;
            // Scale from the card's centre so the caption does not drift sideways.
            v.setPivotX(width / 2f);
            v.setPivotY(width * 9 / 32f);
            v.animate().scaleX(s).scaleY(s).translationZ(hasFocus ? dp(12) : 0).setDuration(150).start();
            card.setForeground(hasFocus ? focusRing() : null);
            if (captionOnFocus) label.animate().alpha(hasFocus ? 1f : 0f).setDuration(150).start();
        });
        return tile;
    }

    private GradientDrawable focusRing() {
        GradientDrawable ring = new GradientDrawable();
        ring.setColor(Color.TRANSPARENT);
        ring.setCornerRadius(dp(12));
        ring.setStroke(dp(3), Color.WHITE);
        return ring;
    }

    // ------------------------------------------------------------ actions

    private void launch(AppEntry e) {
        try {
            startActivity(e.launchIntent);
        } catch (ActivityNotFoundException | SecurityException ex) {
            Toast.makeText(this, "Cannot open " + e.label, Toast.LENGTH_SHORT).show();
            reloadApps();
        }
    }

    private void showOptions(AppEntry e, boolean fromDock) {
        final int pos = dock.indexOf(e.packageName);
        List<String> labels = new ArrayList<>();
        List<Runnable> actions = new ArrayList<>();
        if (pos >= 0) {
            if (fromDock && pos > 0) {
                labels.add("Move left");
                actions.add(() -> moveInDock(pos, pos - 1));
            }
            if (fromDock && pos < dock.size() - 1) {
                labels.add("Move right");
                actions.add(() -> moveInDock(pos, pos + 1));
            }
            labels.add("Remove from dock");
            actions.add(() -> {
                dock.remove(pos);
                saveDock(null);
            });
        } else {
            labels.add("Add to dock");
            actions.add(() -> {
                dock.add(e.packageName);
                saveDock(e.packageName);
                Toast.makeText(this, e.label + " added to dock", Toast.LENGTH_SHORT).show();
            });
        }
        labels.add("App info");
        actions.add(() -> {
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.fromParts("package", e.packageName, null))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (ActivityNotFoundException ex) {
                Toast.makeText(this, "App info is not available on this TV", Toast.LENGTH_SHORT).show();
            }
        });

        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(e.label)
                .setItems(labels.toArray(new String[0]), (d, which) -> actions.get(which).run())
                .show();
    }

    private void moveInDock(int from, int to) {
        String p = dock.remove(from);
        dock.add(to, p);
        saveDock(p);
    }

    private void saveDock(String focusPackage) {
        dockStore.save(dock);
        focusAfterRebuild = isAppsVisible() ? null : focusPackage;
        rebuildDock();
    }

    // ------------------------------------------------------------ panel / focus

    private boolean isAppsVisible() {
        return appsPanel.getVisibility() == View.VISIBLE;
    }

    private void showApps() {
        if (isAppsVisible()) return;
        // Keep D-pad focus inside the panel; the dock stays drawn underneath.
        homeContent.setDescendantFocusability(ViewGroup.FOCUS_BLOCK_DESCENDANTS);
        appsPanel.setVisibility(View.VISIBLE);
        appsPanel.setAlpha(0f);
        appsPanel.setTranslationY(dp(60));
        appsPanel.animate().alpha(1f).translationY(0).setDuration(200).start();
        if (appsGrid.getChildCount() > 0) appsGrid.getChildAt(0).requestFocus();
    }

    private void hideApps() {
        if (!isAppsVisible()) return;
        appsPanel.animate().cancel();
        appsPanel.setVisibility(View.GONE);
        homeContent.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
    }

    private void focusDock(int index) {
        if (dockRow.getChildCount() == 0) return;
        View v = dockRow.getChildAt(Math.max(0, Math.min(index, dockRow.getChildCount() - 1)));
        v.post(v::requestFocus);
    }

    private static int indexOfFocusedChild(ViewGroup parent) {
        View focused = parent.getFocusedChild();
        return focused == null ? -1 : parent.indexOfChild(focused);
    }

    // ------------------------------------------------------------ helpers

    private ImageView wallpaperView() {
        ImageView v = new ImageView(this);
        v.setScaleType(ImageView.ScaleType.CENTER_CROP);
        return v;
    }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        styleText(t, sp, color);
        return t;
    }

    private static void styleText(TextView t, int sp, int color) {
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setIncludeFontPadding(false);
    }

    /** Focused tiles scale past their bounds; parents must not clip them. */
    private static void noClip(ViewGroup g) {
        g.setClipChildren(false);
        g.setClipToPadding(false);
    }

    private static FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
    }

    private static LinearLayout.LayoutParams tileParams(int width, int margin) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                width, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.setMargins(margin, 0, margin, 0);
        return lp;
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }
}
