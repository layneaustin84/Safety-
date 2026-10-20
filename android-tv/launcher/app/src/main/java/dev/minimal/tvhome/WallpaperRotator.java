package dev.minimal.tvhome;

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.animation.LinearInterpolator;
import android.widget.ImageView;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;

/**
 * Cross-fades between two stacked ImageViews with a slow zoom ("Ken Burns").
 *
 * <p>Images come from APK assets ({@code wallpapers/}) plus any files pushed to the app's external
 * {@code files/wallpapers} folder. Decoding happens on {@code io}, sampled to the display size and
 * as RGB_565, so one 1080p frame costs ~4 MB instead of ~8 MB (or ~33 MB for an undecimated 4K JPEG)
 * on TVs with 1-1.5 GB of RAM.
 */
final class WallpaperRotator {
    private static final long INTERVAL_MS = 60_000L;
    private static final long FADE_MS = 1_500L;
    private static final float ZOOM = 1.08f;
    private static final String ASSET_DIR = "wallpapers";

    private final Context context;
    private final ExecutorService io;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ImageView[] layers;
    private final List<String> sources = new ArrayList<>();
    private int front = 0;
    private int next = 0;
    private boolean running;
    /** Incremented on stop so in-flight decodes from a previous start are dropped. */
    private int generation;
    /** Separate from ViewPropertyAnimator so the 60 s zoom never stretches the 1.5 s fade. */
    private ObjectAnimator zoomAnim;

    private final Runnable tick = this::advance;

    WallpaperRotator(Context context, ExecutorService io, ImageView a, ImageView b) {
        this.context = context;
        this.io = io;
        this.layers = new ImageView[] {a, b};
        b.setAlpha(0f);
    }

    void start() {
        if (running) return;
        running = true;
        generation++;
        final int gen = generation;
        io.execute(() -> {
            List<String> found = scan();
            main.post(() -> {
                if (!running || gen != generation) return;
                sources.clear();
                sources.addAll(found);
                if (layers[front].getDrawable() == null) {
                    advance();
                } else {
                    // Returning from an app: keep the current image, resume the timer.
                    main.postDelayed(tick, INTERVAL_MS);
                    zoom(layers[front]);
                }
            });
        });
    }

    void stop() {
        running = false;
        generation++;
        main.removeCallbacks(tick);
        for (ImageView v : layers) v.animate().cancel();
        if (zoomAnim != null) zoomAnim.cancel();
    }

    private void advance() {
        if (!running || sources.isEmpty()) return;
        final String src = sources.get(next % sources.size());
        next++;
        final int gen = generation;
        DisplayMetrics dm = context.getResources().getDisplayMetrics();
        final int w = Math.max(dm.widthPixels, dm.heightPixels);
        final int h = Math.min(dm.widthPixels, dm.heightPixels);
        io.execute(() -> {
            Bitmap bmp = decode(src, w, h);
            main.post(() -> {
                if (!running || gen != generation) return;
                if (bmp != null) show(bmp);
                main.postDelayed(tick, bmp != null ? INTERVAL_MS : 1_000L);
            });
        });
    }

    private void show(Bitmap bmp) {
        final ImageView out = layers[front];
        final ImageView in = layers[1 - front];
        in.animate().cancel();
        in.setImageBitmap(bmp);
        in.setScaleX(1f);
        in.setScaleY(1f);
        in.setAlpha(0f);
        in.bringToFront();
        in.animate().alpha(1f).setDuration(out.getDrawable() == null ? 0 : FADE_MS)
                .withEndAction(() -> {
                    // Release the old frame so only one full-screen bitmap stays resident.
                    out.setImageDrawable(null);
                    out.setAlpha(0f);
                })
                .start();
        zoom(in);
        front = 1 - front;
    }

    /** Zoom from the view's current scale to ZOOM, so a resumed zoom continues smoothly. */
    private void zoom(ImageView v) {
        if (zoomAnim != null) zoomAnim.cancel();
        zoomAnim = ObjectAnimator.ofPropertyValuesHolder(v,
                PropertyValuesHolder.ofFloat(View.SCALE_X, v.getScaleX(), ZOOM),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, v.getScaleY(), ZOOM));
        zoomAnim.setInterpolator(new LinearInterpolator());
        zoomAnim.setDuration(INTERVAL_MS + FADE_MS);
        zoomAnim.start();
    }

    /** Asset paths are prefixed with "asset:"; everything else is an absolute file path. */
    private List<String> scan() {
        List<String> out = new ArrayList<>();
        try {
            String[] names = context.getAssets().list(ASSET_DIR);
            if (names != null) {
                for (String n : names) if (isImage(n)) out.add("asset:" + ASSET_DIR + "/" + n);
            }
        } catch (IOException ignored) {
            // No bundled wallpapers; external files may still exist.
        }
        File dir = context.getExternalFilesDir(ASSET_DIR);
        File[] files = dir != null ? dir.listFiles() : null;
        if (files != null) {
            for (File f : files) if (f.isFile() && isImage(f.getName())) out.add(f.getAbsolutePath());
        }
        Collections.shuffle(out);
        return out;
    }

    private static boolean isImage(String name) {
        String n = name.toLowerCase(Locale.ROOT);
        return n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp");
    }

    private Bitmap decode(String src, int reqW, int reqH) {
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            try (InputStream in = open(src)) {
                BitmapFactory.decodeStream(in, null, bounds);
            }
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sampleSize(bounds.outWidth, bounds.outHeight, reqW, reqH);
            opts.inPreferredConfig = Bitmap.Config.RGB_565;
            try (InputStream in = open(src)) {
                return BitmapFactory.decodeStream(in, null, opts);
            }
        } catch (IOException | OutOfMemoryError | SecurityException e) {
            return null; // Skip unreadable or oversized files; rotation continues.
        }
    }

    private InputStream open(String src) throws IOException {
        if (src.startsWith("asset:")) {
            return context.getAssets().open(src.substring("asset:".length()), AssetManager.ACCESS_STREAMING);
        }
        return new FileInputStream(src);
    }

    /** Largest power of two that keeps the decoded image at least as large as the screen. */
    static int sampleSize(int w, int h, int reqW, int reqH) {
        int sample = 1;
        while (w / (sample * 2) >= reqW && h / (sample * 2) >= reqH) sample *= 2;
        return sample;
    }
}
