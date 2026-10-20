/** P ボタン。押されると P への切り替えを要求する */
class ParkButton {
    private final Transmission transmission;

    ParkButton(Transmission transmission) {
        this.transmission = transmission;
    }

    void press(int speed) {
        char from = transmission.position;
        // 走行中は P に入れない
        if (speed != 0) {
            System.out.println(from + "→P " + speed + "km/h 拒否 現在" + transmission.position);
            return;
        }
        transmission.position = 'P';
        System.out.println(from + "→P " + speed + "km/h 受付 現在" + transmission.position);
    }
}
