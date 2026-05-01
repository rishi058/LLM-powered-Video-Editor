import React, { useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";

// Display-only: strips trailing _<digits> before the extension, e.g. foo_1773949404810.mp4 -> foo.mp4
const stripTimestampSuffix = (filename: string) =>
  filename.replace(/_\d+(\.[^.]+)$/, "$1");

export default function SyncCaption() {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<{name: string, absolutePath: string}[]>([]);
  const [outDir, setOutDir] = useState("");
  const [selectedFile, setSelectedFile] = useState("");
  
  const [scriptPref, setScriptPref] = useState<"devanagari" | "english">("devanagari");
  
  const [forceAlignment, setForceAlignment] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // process.cwd() is unavailable in the browser environment.
      // We must fetch the file list and directory path via our backend API.
      fetch("/api/out-files")
        .then(res => res.json())
        .then(data => {
          if (data.files) {
            setFiles(data.files);
          }
          if (data.outDir) {
            setOutDir(data.outDir);
          }
        })
        .catch(err => {
          console.error(err);
          toast.error("Failed to load files. Is the Remix dev server running?");
        });
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error("Please select a media file first.");
      return;
    }
    
    if (forceAlignment && !lyrics.trim()) {
      toast.error("Please paste lyrics for force alignment.");
      return;
    }
    
    const mediaPath = files.find(f => f.name === selectedFile)?.absolutePath;

    const payload = {
      media_path: mediaPath?.replace(/\\/g, '/'),
      output_path: outDir?.replace(/\\/g, '/') + "/",
      lyrics: forceAlignment ? lyrics : "",
      force_alignment: forceAlignment,
      devanagari_output: scriptPref === "devanagari"
    };

    setIsSubmitting(true);
    toast.info("Started caption synchronization. This may take 5-10 minutes...");
    
    try {
      const controller = new AbortController();
      // 15 minutes timeout
      const timeoutId = setTimeout(() => controller.abort(), 15 * 60 * 1000);
      
      const res = await fetch("http://localhost:5001/sync-lyrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (res.ok) {
        toast.success("Lyrics synchronized successfully!");
      } else {
        const err = await res.text();
        toast.error(`Failed to sync: ${err}`);
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        toast.error("Sync request timed out after 15 minutes.");
      } else {
        toast.error(`Error syncing: ${error.message}`);
      }
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col border-b border-border/50 bg-background">
      <div className="p-2 space-y-1">
        <Button 
          variant="secondary" 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex justify-between items-center h-10 px-3"
        >
          <span className="text-sm font-medium">Sync Caption</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4"/>}
        </Button>
        <p className="text-[12px] text-muted-foreground leading-tight px-1 mt-1 text-center">
          Always try to provide you own caption rather generating it. Dont use (x3) for repeated lyrics, use exact words
        </p>
      </div>

      {isOpen && (
        <div className="p-3 pt-1 space-y-4">
          <div className="flex flex-col space-y-1.5">
            <Label className="text-xs">Select Media <span className="text-destructive">*</span></Label>
            <select 
              className="flex h-8 w-full rounded-md border border-white/20 bg-black text-white px-2 py-1 text-xs shadow-sm transition-colors outline-none hover:ring-1 hover:ring-yellow-400 focus:ring-1 focus:ring-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              style={{ colorScheme: "dark" }}
            >
              <option value="" disabled className="bg-black text-white">MP4/MP3</option>
              {files.map(f => (
                 <option key={f.name} value={f.name} className="bg-black text-white">{stripTimestampSuffix(f.name)}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col space-y-1.5">
            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">If Audio is Hindi:</Label>
            <div className="flex flex-col space-y-2 mt-1">
              <label className="flex items-center space-x-2 text-xs cursor-pointer">
                <input 
                  type="radio" 
                  name="scriptPref" 
                  value="devanagari"
                  checked={scriptPref === "devanagari"}
                  onChange={() => setScriptPref("devanagari")}
                  className="rounded-full border-primary text-primary focus:ring-primary accent-primary h-3.5 w-3.5"
                />
                <span>Devanagari Script</span>
              </label>
              <label className="flex items-center space-x-2 text-xs cursor-pointer">
                <input 
                  type="radio" 
                  name="scriptPref" 
                  value="english"
                  checked={scriptPref === "english"}
                  onChange={() => setScriptPref("english")}
                  className="rounded-full border-primary text-primary focus:ring-primary accent-primary h-3.5 w-3.5"
                />
                <span>English</span>
              </label>
            </div>
          </div>

          <div className="flex flex-col space-y-2.5 pt-2 border-t border-border/30">
            <div className="flex items-center justify-between">
              <Label htmlFor="force-alignment" className="text-xs font-medium cursor-pointer">Already Have Lyrics(Force Alignment)</Label>
              <Switch 
                id="force-alignment" 
                checked={forceAlignment}
                onCheckedChange={setForceAlignment}
                className="scale-90 data-[state=checked]:bg-primary"
              />
            </div>
            
            {forceAlignment && (
              <textarea 
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus:ring-1 focus:ring-ring focus:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                placeholder="Paste exact lyrics here..."
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
              />
            )}
          </div>

          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !selectedFile}
            className="w-full h-9 text-xs mt-2"
          >
            {isSubmitting && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {isSubmitting ? "Processing..." : "Submit"}
          </Button>
        </div>
      )}
    </div>
  );
}
