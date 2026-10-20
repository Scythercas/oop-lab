public class Main {
    public static void main(String[] args) {
        Transmission transmission = new Transmission();
        ShiftLever lever = new ShiftLever(transmission);
        ParkButton parkButton = new ParkButton(transmission);
        TestTool testTool = new TestTool(transmission);

        lever.request('D', 0);
        lever.request('R', 20);
        lever.request('N', 15);
        parkButton.press(15);
        lever.request('D', 0);
        lever.request('P', 5);
        testTool.force('R', 30);
    }
}
