param(
    [string]$InitialDir = "",
    [string]$Title = "Select Folder"
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class Win32FolderPicker {
    [ComImport, Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7"), ClassInterface(ClassInterfaceType.None)]
    private class FileOpenDialogRCW { }

    [ComImport, Guid("d57c7288-d4ad-4768-be02-9d969532d960"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes();
        void SetFileTypeIndex();
        void GetFileTypeIndex();
        void Advise();
        void Unadvise();
        void SetOptions(uint fos);
        void GetOptions(out uint fos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace();
        void SetDefaultExtension();
        void Close();
        void SetClientGuid();
        void ClearClientData();
        void SetFilter();
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        void BindToHandler();
        void GetParent();
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes();
        void Compare();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        [MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        out IShellItem ppv
    );

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    public static string PickFolder(string initialFolder, string title) {
        var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
        // FOS_PICKFOLDERS = 0x20, FOS_FORCEFILESYSTEM = 0x40
        dialog.SetOptions(0x20 | 0x40);
        if (!string.IsNullOrEmpty(title)) {
            dialog.SetTitle(title);
        }
        if (!string.IsNullOrEmpty(initialFolder) && System.IO.Directory.Exists(initialFolder)) {
            try {
                IShellItem item;
                SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, typeof(IShellItem).GUID, out item);
                if (item != null) {
                    dialog.SetFolder(item);
                }
            } catch {}
        }
        IntPtr fg = GetForegroundWindow();
        int hr = dialog.Show(fg);
        if (hr == 0) {
            IShellItem res;
            dialog.GetResult(out res);
            if (res != null) {
                string path;
                res.GetDisplayName(0x80058000, out path); // SIGDN_FILESYSPATH
                return path;
            }
        }
        return null;
    }
}
"@

try {
    $result = [Win32FolderPicker]::PickFolder($InitialDir, $Title)
    if ($result) {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        [Console]::WriteLine($result)
    }
} catch {
    Write-Error $_
}
