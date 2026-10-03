using NUnitLite;
public static class Program
{
    public static int Main(string[] args) => new AutoRun(typeof(Program).Assembly).Execute(args);
}
