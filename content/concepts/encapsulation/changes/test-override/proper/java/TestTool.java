/** 試験用の道具。工場の検査で、規則を確かめずにシフト位置を設定する */
class TestTool {
    private final Transmission transmission;

    TestTool(Transmission transmission) {
        this.transmission = transmission;
    }

    void force(char to, int speed) {
        char from = transmission.getPosition();
        transmission.forceForTest(to);
        System.out.println(from + "→" + to + " " + speed + "km/h 試験設定 現在" + transmission.getPosition());
    }
}
