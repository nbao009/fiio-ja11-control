namespace Ja11Control;

internal static class Program
{
    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length == 1 && args[0] == "--recover-usb")
        {
            Environment.ExitCode = Ja11Recovery.Cycle();
            return;
        }
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}
