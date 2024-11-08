"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export default function Component() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
        <div className="container relative h-14 flex items-center justify-center">
          <Link href="/" className="absolute left-4">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-semibold">Make a post</h1>
        </div>
      </header>

      <main className="container max-w-md mx-auto p-4 space-y-4">
        {selectedImage ? (
          <div className="aspect-square relative rounded-2xl overflow-hidden bg-muted">
            <Image
              src={selectedImage}
              alt="Selected image"
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <label className="block aspect-square rounded-2xl border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground">
                Click to upload image
              </span>
            </div>
          </label>
        )}

        <Input
          type="text"
          placeholder="Add a title"
          className="text-lg font-semibold bg-transparent border-none px-0 placeholder:text-muted-foreground"
        />

        <Textarea
          placeholder="Write a description..."
          className="min-h-[100px] bg-transparent border-none resize-none px-0 placeholder:text-muted-foreground"
        />

        <Button
          className="w-full bg-[#5B51E6] hover:bg-[#4A41D4] text-white"
          size="lg"
        >
          Continue
        </Button>
      </main>
    </div>
  );
}
