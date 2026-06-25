import { useEffect, useRef } from "react";
import Quill from "quill";
import "quill/dist/quill.snow.css";

interface QuillEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function QuillEditor({ value, onChange, placeholder = "Soạn nội dung email..." }: QuillEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<Quill | null>(null);
  const isUpdatingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const editorDiv = document.createElement("div");
    containerRef.current.appendChild(editorDiv);

    const quill = new Quill(editorDiv, {
      theme: "snow",
      placeholder,
      modules: {
        toolbar: [
          [{ font: [] }, { size: [] }],
          ["bold", "italic", "underline", "strike"],
          [{ color: [] }, { background: [] }],
          [{ script: "sub" }, { script: "super" }],
          [{ header: [1, 2, 3, 4, 5, 6, false] }, "blockquote", "code-block"],
          [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
          [{ direction: "rtl" }, { align: [] }],
          ["link", "image", "clean"],
        ],
      },
    });

    quillRef.current = quill;

    // Set initial value
    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    }

    // Handle text change event
    quill.on("text-change", () => {
      if (isUpdatingRef.current) return;
      const html = quill.root.innerHTML;
      const sanitized = html === "<p><br></p>" ? "" : html;
      onChange(sanitized);
    });

    return () => {
      quill.off("text-change");
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      quillRef.current = null;
    };
  }, []);

  // Update value dynamically if modified from parent component (excluding internal changes)
  useEffect(() => {
    if (!quillRef.current) return;
    const currentHtml = quillRef.current.root.innerHTML;
    const cleanCurrent = currentHtml === "<p><br></p>" ? "" : currentHtml;

    if (value !== cleanCurrent) {
      isUpdatingRef.current = true;
      quillRef.current.root.innerHTML = value || "<p><br></p>";
      isUpdatingRef.current = false;
    }
  }, [value]);

  return (
    <div className="bg-white rounded-md border border-gray-200 overflow-hidden text-gray-800 flex flex-col h-full">
      <div ref={containerRef} className="flex-1 overflow-y-hidden" />
    </div>
  );
}
