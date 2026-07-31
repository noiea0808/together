package com.gachimeokja.app;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Android WebView는 CSS env(safe-area-inset-*)를 디스플레이 컷아웃에만 반영하고
    // 상태바/내비게이션 바 높이는 반영하지 않는다(iOS Safari와 다른 부분). targetSdk 35+는
    // 엣지투엣지가 강제라 그대로 두면 상단 헤더가 상태바 밑에, 하단 요소가 제스처바 밑에
    // 깔린다. 그래서 실측 시스템 바 인셋을 여기서 직접 읽어 웹 쪽 CSS 변수로 주입한다.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            float density = getResources().getDisplayMetrics().density;
            int topPx = Math.round(bars.top / density);
            int bottomPx = Math.round(bars.bottom / density);

            String js = "document.documentElement.style.setProperty('--safe-area-inset-top', '"
                    + topPx + "px');"
                    + "document.documentElement.style.setProperty('--safe-area-inset-bottom', '"
                    + bottomPx + "px');";
            if (bridge != null && bridge.getWebView() != null) {
                bridge.getWebView().post(() -> bridge.getWebView().evaluateJavascript(js, null));
            }
            return windowInsets;
        });
    }
}
