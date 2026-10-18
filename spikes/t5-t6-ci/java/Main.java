// T6: Java 21 で日本語の出力が期待結果と一致するか
public class Main {
    public static void main(String[] args) {
        Tire tire = new Tire("左前", 230);
        System.out.println(tire.describe());
        System.out.println("合計 " + (1 + 2));
    }
}

class Tire {
    private final String position;
    private final int pressure;

    Tire(String position, int pressure) {
        this.position = position;
        this.pressure = pressure;
    }

    String describe() {
        return position + " " + pressure + "kPa";
    }
}
