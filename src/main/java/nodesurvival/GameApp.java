package nodesurvival;

import javafx.animation.AnimationTimer;
import javafx.application.Application;
import javafx.scene.Scene;
import javafx.scene.canvas.Canvas;
import javafx.scene.canvas.GraphicsContext;
import javafx.scene.input.KeyCode;
import javafx.scene.layout.StackPane;
import javafx.scene.paint.Color;
import javafx.scene.text.Font;
import javafx.stage.Stage;
import nodesurvival.model.GameState;
import nodesurvival.systems.GameManager;
import nodesurvival.ui.Renderer;

import java.util.HashSet;
import java.util.Set;

public class GameApp extends Application {

    private static final double WIDTH = 900;
    private static final double HEIGHT = 900;

    private final GameManager gameManager = new GameManager();
    private final Renderer renderer = new Renderer();
    private final Set<KeyCode> pressedKeys = new HashSet<>();

    private int selectedPlayerCount = 4;
    private long lastNanoTime = -1;

    @Override
    public void start(Stage stage) {
        Canvas canvas = new Canvas(WIDTH, HEIGHT);
        GraphicsContext gc = canvas.getGraphicsContext2D();

        StackPane root = new StackPane(canvas);
        Scene scene = new Scene(root, WIDTH, HEIGHT);

        scene.setOnKeyPressed(e -> {
            pressedKeys.add(e.getCode());
            handleMenuKeys(e.getCode());
        });
        scene.setOnKeyReleased(e -> pressedKeys.remove(e.getCode()));

        stage.setTitle("Node Survival - JavaFX Prototype");
        stage.setScene(scene);
        stage.show();

        AnimationTimer timer = new AnimationTimer() {
            @Override
            public void handle(long now) {
                if (lastNanoTime < 0) {
                    lastNanoTime = now;
                    return;
                }
                double dt = Math.min(0.05, (now - lastNanoTime) / 1_000_000_000.0);
                lastNanoTime = now;

                double mx = 0, my = 0;
                if (pressedKeys.contains(KeyCode.W) || pressedKeys.contains(KeyCode.UP)) my -= 1;
                if (pressedKeys.contains(KeyCode.S) || pressedKeys.contains(KeyCode.DOWN)) my += 1;
                if (pressedKeys.contains(KeyCode.A) || pressedKeys.contains(KeyCode.LEFT)) mx -= 1;
                if (pressedKeys.contains(KeyCode.D) || pressedKeys.contains(KeyCode.RIGHT)) mx += 1;

                if (gameManager.getState() != GameState.MENU) {
                    gameManager.tick(dt, mx, my);
                }

                renderer.render(gc, gameManager, WIDTH, HEIGHT);
                drawMenuOverlayIfNeeded(gc);
            }
        };
        timer.start();
    }

    private void handleMenuKeys(KeyCode code) {
        GameState state = gameManager.getState();
        if (state == GameState.MENU) {
            if (code == KeyCode.DIGIT3) selectedPlayerCount = 3;
            if (code == KeyCode.DIGIT4) selectedPlayerCount = 4;
            if (code == KeyCode.DIGIT5) selectedPlayerCount = 5;
            if (code == KeyCode.DIGIT6) selectedPlayerCount = 6;
            if (code == KeyCode.DIGIT7) selectedPlayerCount = 7;
            if (code == KeyCode.SPACE) gameManager.startNewMatch(selectedPlayerCount);
        } else if (state == GameState.GAME_OVER) {
            if (code == KeyCode.R) gameManager.startNewMatch(selectedPlayerCount);
        }
    }

    private void drawMenuOverlayIfNeeded(GraphicsContext gc) {
        if (gameManager.getState() != GameState.MENU) return;

        gc.setFill(Color.web("#0d0f14"));
        gc.fillRect(0, 0, WIDTH, HEIGHT);
        gc.setFill(Color.WHITE);
        gc.setFont(Font.font(28));
        gc.fillText("NODE SURVIVAL", WIDTH / 2 - 130, HEIGHT / 2 - 80);
        gc.setFont(Font.font(16));
        gc.fillText("Players (you + bots): " + selectedPlayerCount + "   (press 3-7 to change)",
                WIDTH / 2 - 170, HEIGHT / 2 - 30);
        gc.fillText("Press SPACE to start", WIDTH / 2 - 80, HEIGHT / 2);
        gc.fillText("Move with WASD / Arrow keys", WIDTH / 2 - 110, HEIGHT / 2 + 30);
    }

    public static void main(String[] args) {
        launch(args);
    }
}
