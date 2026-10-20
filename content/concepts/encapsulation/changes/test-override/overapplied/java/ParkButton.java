/** P ボタン。押されると P への切り替えを要求する */
class ParkButton {
    private final Transmission transmission;

    ParkButton(Transmission transmission) {
        this.transmission = transmission;
    }

    void press(int speed) {
        char from = transmission.getPosition();
        transmission.setPosition('P');
        System.out.println(from + "→P " + speed + "km/h 受付 現在" + transmission.getPosition());
    }
}
