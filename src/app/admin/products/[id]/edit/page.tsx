"use client";
import { PageHeader } from "@/components/PageHeader";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import SearchableSelect from "@/components/SearchableSelect";
import AutocompleteInput from "@/components/AutocompleteInput";
import ProductGallery from "@/components/ProductGallery";
import RfidTagField from "@/components/RfidTagField";
import { Skeleton } from "@/components/Skeleton";
import { Spinner } from "@/components/Spinner";

interface DropdownOption {
  id: string;
  value: string;
}

export default function EditProductPage() {
  const router = useRouter();
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    rfidTag: "",
    brand: "",
    materialType: "",
    category: "",
    productCode: "",
    name: "",
    location: "",
    size: "",
    colour: "",
    description: "",
    imageUrl: "",
    returnable: true, // image3: true = must-return sample; false = give-away
  });

  const [brands, setBrands] = useState<DropdownOption[]>([]);
  const [materialTypes, setMaterialTypes] = useState<DropdownOption[]>([]);
  const [categories, setCategories] = useState<DropdownOption[]>([]);

  const inputStyle = {
    background: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text)",
  };

  useEffect(() => {
    async function fetchAll() {
      const [product, b, m, c] = await Promise.all([
        fetch(`/api/products/${id}`).then((r) => r.json()),
        fetch("/api/dropdown?type=brand").then((r) => r.json()),
        fetch("/api/dropdown?type=materialType").then((r) => r.json()),
        fetch("/api/dropdown?type=category").then((r) => r.json()),
      ]);
      setForm({
        rfidTag: product.rfidTag || "",
        brand: product.brand || "",
        materialType: product.materialType || "",
        category: product.category || "",
        productCode: product.productCode || "",
        name: product.name || "",
        location: product.location || "",
        size: product.size || "",
        colour: product.colour || "",
        description: product.description || "",
        imageUrl: product.imageUrl || "",
        returnable: product.returnable !== false,
      });
      setBrands(b);
      setMaterialTypes(m);
      setCategories(c);
      setFetching(false);
    }
    fetchAll();
  }, [id]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSelect(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit() {
    if (!form.rfidTag || !form.name) {
      setError("Please fill in required fields (RFID Tag, Product Name)");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form }),
      });
      if (res.ok) {
        router.push("/admin/products");
      } else {
        setError("Failed to update product");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (fetching) return (
    <div>
      {/* Static header renders immediately; only the form (product data) is skeletoned. */}
      <PageHeader
        title="Edit Product"
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Product Management", href: "/admin/products" }, { label: "Edit Product" }]}
        actions={
          <button onClick={() => router.push("/admin/products")}
            className="px-5 py-2 rounded-xl text-sm"
            style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
            ← Back
          </button>
        }
      />
      <div className="rounded-2xl p-6" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 mb-2" style={{ width: "30%" }} />
              <Skeleton className="h-10" />
            </div>
          ))}
        </div>
        <Skeleton className="h-40 mt-6 rounded-xl" />
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Edit Product"
        crumbs={[{ label: "Home", href: "/admin" }, { label: "Product Management", href: "/admin/products" }, { label: "Edit Product" }]}
        actions={
          <button onClick={() => router.push("/admin/products")}
            className="px-5 py-2 rounded-xl text-sm"
            style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
            ← Back
          </button>
        }
      />

      <div className="rounded-xl p-6 max-w-3xl" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div className="space-y-4">

          {/* RFID Tag — scan with a reader, or type it */}
          <RfidTagField value={form.rfidTag} onChange={(v) => setForm((p) => ({ ...p, rfidTag: v }))} />

          {/* Product Code */}
          <div>
            <label htmlFor="productCode" className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Product Code</label>
            <input id="productCode" name="productCode" value={form.productCode} onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
          </div>

          {/* Brand + Material Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Brand</label>
              <SearchableSelect options={brands} value={form.brand}
                onChange={(v) => handleSelect("brand", v)} placeholder="Select brand" />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Material Type</label>
              <SearchableSelect options={materialTypes} value={form.materialType}
                onChange={(v) => handleSelect("materialType", v)} placeholder="Select material type" />
            </div>
          </div>

          {/* Category + Product Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Category</label>
              <SearchableSelect options={categories} value={form.category}
                onChange={(v) => handleSelect("category", v)} placeholder="Select category" searchable />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>
                Product Name <span style={{ color: "var(--color-danger-soft)" }}>*</span>
              </label>
              <AutocompleteInput
                value={form.name}
                onChange={(v) => handleSelect("name", v)}
                placeholder="Type product name..."
                fetchUrl="/api/products/names"
              />
            </div>
          </div>

          {/* Location + physical attributes (customer req #2: track product location) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="location" className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Location (in showroom)</label>
              <input id="location" name="location" value={form.location} onChange={handleChange} placeholder="e.g. Zone A, Floor 2"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="size" className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Size</label>
              <input id="size" name="size" value={form.size} onChange={handleChange} placeholder="e.g. 60x60 cm"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="colour" className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Colour</label>
              <input id="colour" name="colour" value={form.colour} onChange={handleChange} placeholder="e.g. Walnut"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="description" className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Description</label>
              <input id="description" name="description" value={form.description} onChange={handleChange} placeholder="Short description…"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
          </div>

          {/* image3: give-away vs must-return */}
          <div>
            <label className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Return policy</label>
            <label className="flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer" style={inputStyle}>
              <input type="checkbox" checked={form.returnable} onChange={(e) => setForm((p) => ({ ...p, returnable: e.target.checked }))} className="w-4 h-4 mt-0.5" />
              <span className="text-sm" style={{ color: "var(--color-text)" }}>
                <strong>Must be returned</strong> — sends a prepare alert + tracks the return<br />
                <span style={{ color: "var(--color-text-muted)" }}>Unchecked = <strong>give-away</strong> — no alert, no return tracking</span>
              </span>
            </label>
          </div>

          {/* Product Images — first image is the cover (synced to imageUrl) */}
          <div>
            <label className="block text-sm mb-1 font-medium" style={{ color: "var(--color-text)" }}>Product Images</label>
            <ProductGallery
              productId={String(id)}
              onCoverChange={(url) => handleSelect("imageUrl", url)}
            />
          </div>

          {error && <p className="text-sm" style={{ color: "var(--color-danger-soft)" }}>{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSubmit} disabled={loading}
              className="px-6 py-3 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-primary)", color: "var(--color-surface)", opacity: loading ? 0.7 : 1 }}>
              {loading ? <span className="inline-flex items-center gap-2"><Spinner size="xs" color="currentColor" /> Saving...</span> : "Save Changes"}
            </button>
            <button onClick={() => router.push("/admin/products")}
              className="px-6 py-3 rounded-xl text-sm"
              style={{ background: "var(--color-bg)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}