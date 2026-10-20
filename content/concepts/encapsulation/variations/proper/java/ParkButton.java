/** P ボタン。押されると P への切り替えを要求する */
class ParkButton {
    private final Transmission transmission;

    ParkButton(Transmission transmission) {
        this.transmission = transmission;
    }

    void press(int speed) {
        char from = transmission.getPosition();
        boolean accepted = transmission.shiftTo('P', speed);
        String result = accepted ? "受付" : "拒否";
        System.out.println(from + "→P " + speed + "km/h " + result + " 現在" + transmission.getPosition());
    }
}
