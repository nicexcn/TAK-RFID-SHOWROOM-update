"use client";
import Breadcrumb from "@/components/Breadcrumb";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import SearchableSelect from "@/components/SearchableSelect";
import AutocompleteInput from "@/components/AutocompleteInput";
import ProductGallery from "@/components/ProductGallery";
import RfidTagField from "@/components/RfidTagField";

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
  });

  const [brands, setBrands] = useState<DropdownOption[]>([]);
  const [materialTypes, setMaterialTypes] = useState<DropdownOption[]>([]);
  const [categories, setCategories] = useState<DropdownOption[]>([]);

  const inputStyle = {
    background: "#f5f2ee",
    border: "1px solid #e6e5d8",
    color: "#4c4847",
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
    <div className="flex items-center justify-center h-64">
      <p style={{ color: "#cdc3ad" }}>Loading...</p>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "#4c4847" }}>Edit Product</h1>
          <Breadcrumb items={[{ label: "Home", href: "/admin" }, { label: "Product Management", href: "/admin/products" }, { label: "Edit Product" }]} />
        </div>
        <button onClick={() => router.push("/admin/products")}
          className="px-5 py-2 rounded-xl text-sm"
          style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>
          ← Back
        </button>
      </div>

      <div className="rounded-xl p-6 max-w-3xl" style={{ background: "#fff", border: "1px solid #e6e5d8" }}>
        <div className="space-y-4">

          {/* RFID Tag — scan with a reader, or type it */}
          <RfidTagField value={form.rfidTag} onChange={(v) => setForm((p) => ({ ...p, rfidTag: v }))} />

          {/* Product Code */}
          <div>
            <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Product Code</label>
            <input name="productCode" value={form.productCode} onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
          </div>

          {/* Brand + Material Type */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Brand</label>
              <SearchableSelect options={brands} value={form.brand}
                onChange={(v) => handleSelect("brand", v)} placeholder="Select brand" />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Material Type</label>
              <SearchableSelect options={materialTypes} value={form.materialType}
                onChange={(v) => handleSelect("materialType", v)} placeholder="Select material type" />
            </div>
          </div>

          {/* Category + Product Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Category</label>
              <SearchableSelect options={categories} value={form.category}
                onChange={(v) => handleSelect("category", v)} placeholder="Select category" searchable />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>
                Product Name <span style={{ color: "#9f4a4a" }}>*</span>
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
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Location (ตำแหน่งในโชว์รูม)</label>
              <input name="location" value={form.location} onChange={handleChange} placeholder="เช่น โซน A ชั้น 2"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Size</label>
              <input name="size" value={form.size} onChange={handleChange} placeholder="เช่น 60x60 cm"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Colour</label>
              <input name="colour" value={form.colour} onChange={handleChange} placeholder="เช่น Walnut"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Description</label>
              <input name="description" value={form.description} onChange={handleChange} placeholder="รายละเอียดสั้นๆ"
                className="w-full px-4 py-3 rounded-xl outline-none text-sm" style={inputStyle} />
            </div>
          </div>

          {/* Product Images — first image is the cover (synced to imageUrl) */}
          <div>
            <label className="block text-sm mb-1 font-medium" style={{ color: "#4c4847" }}>Product Images</label>
            <ProductGallery
              productId={String(id)}
              onCoverChange={(url) => handleSelect("imageUrl", url)}
            />
          </div>

          {error && <p className="text-sm" style={{ color: "#9f4a4a" }}>{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSubmit} disabled={loading}
              className="px-6 py-3 rounded-xl text-sm font-medium"
              style={{ background: "#726c5a", color: "#fff", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Saving..." : "Save Changes"}
            </button>
            <button onClick={() => router.push("/admin/products")}
              className="px-6 py-3 rounded-xl text-sm"
              style={{ background: "#f5f2ee", color: "#726c5a", border: "1px solid #e6e5d8" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}