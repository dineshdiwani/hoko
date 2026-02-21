import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import api from "../../services/api";
import { getAttachmentDisplayName } from "../../utils/attachments";

function formatValue(value) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text ? text : "-";
}

export default function CompareOffers() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [requirement, setRequirement] = useState(null);
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get(`/buyer/requirements/${id}/offers`);
        setRequirement(res.data?.requirement || null);
        const sorted = [...(res.data?.offers || [])].sort(
          (a, b) => Number(a.price || 0) - Number(b.price || 0)
        );
        setOffers(sorted);
      } catch {
        setRequirement(null);
        setOffers([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const columns = useMemo(() => {
    return offers.map((offer, index) => ({
      key: String(offer._id || offer.id || index),
      title: `L${index + 1} - ${offer.sellerFirm || "Seller"}`
    }));
  }, [offers]);

  const rows = useMemo(() => {
    if (!requirement) return [];

    const requirementAttachments = Array.isArray(requirement.attachments)
      ? requirement.attachments
      : [];
    const requirementAttachmentText = requirementAttachments.length
      ? requirementAttachments
          .map((attachment, index) => getAttachmentDisplayName(attachment, index))
          .join(", ")
      : "-";

    const requirementBase = {
      city: formatValue(requirement.city),
      category: formatValue(requirement.category),
      product: formatValue(requirement.product || requirement.productName),
      makeBrand: formatValue(requirement.makeBrand || requirement.brand),
      typeModel: formatValue(requirement.typeModel),
      quantityUnit: formatValue(
        `${requirement.quantity || ""} ${requirement.type || requirement.unit || ""}`.trim()
      ),
      details: formatValue(requirement.details || requirement.description),
      attachments: formatValue(requirementAttachmentText)
    };

    const mapOfferAttachments = (offer) => {
      const items = Array.isArray(offer.attachments) ? offer.attachments : [];
      if (!items.length) return "-";
      return items
        .map((attachment, index) => getAttachmentDisplayName(attachment, index))
        .join(", ");
    };

    const rowDefs = [
      {
        field: "Requirement City",
        valueForOffer: () => requirementBase.city
      },
      {
        field: "Requirement Category",
        valueForOffer: () => requirementBase.category
      },
      {
        field: "Requirement Product",
        valueForOffer: () => requirementBase.product
      },
      {
        field: "Requirement Make/Brand",
        valueForOffer: () => requirementBase.makeBrand
      },
      {
        field: "Requirement Type/Model",
        valueForOffer: () => requirementBase.typeModel
      },
      {
        field: "Requirement Quantity/Unit",
        valueForOffer: () => requirementBase.quantityUnit
      },
      {
        field: "Requirement Details",
        valueForOffer: () => requirementBase.details
      },
      {
        field: "Requirement Attachments",
        valueForOffer: () => requirementBase.attachments
      },
      {
        field: "Offered Price",
        valueForOffer: (offer) => formatValue(offer.price)
      },
      {
        field: "Delivery Time",
        valueForOffer: (offer) => formatValue(offer.deliveryTime)
      },
      {
        field: "Payment Terms",
        valueForOffer: (offer) => formatValue(offer.paymentTerms)
      },
      {
        field: "Offer Details",
        valueForOffer: (offer) =>
          formatValue(offer.message || offer.note || offer.details || offer.description)
      },
      {
        field: "Offer Attachments",
        valueForOffer: (offer) => formatValue(mapOfferAttachments(offer))
      },
      {
        field: "Seller City",
        valueForOffer: (offer) => formatValue(offer.sellerCity)
      }
    ];

    return rowDefs.map((def) => ({
      field: def.field,
      values: offers.map((offer) => def.valueForOffer(offer))
    }));
  }, [requirement, offers]);

  function buildTableData() {
    const headers = ["Field", ...columns.map((c) => c.title)];
    const body = rows.map((row) => [row.field, ...row.values]);
    return { headers, body };
  }

  function downloadXlsx() {
    if (!rows.length || !columns.length) {
      alert("At least 2 offers are required for comparison export.");
      return;
    }
    const { headers, body } = buildTableData();
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Offer Comparison");
    XLSX.writeFile(workbook, `offer-comparison-${id}.xlsx`);
  }

  function downloadPdf() {
    if (!rows.length || !columns.length) {
      alert("At least 2 offers are required for comparison export.");
      return;
    }
    const { headers, body } = buildTableData();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    doc.setFontSize(12);
    doc.text("Offer Comparison", 40, 30);
    autoTable(doc, {
      head: [headers],
      body,
      startY: 50,
      styles: { fontSize: 8, cellPadding: 4, overflow: "linebreak" },
      headStyles: { fillColor: [31, 41, 55] }
    });
    doc.save(`offer-comparison-${id}.pdf`);
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-shell py-8 text-gray-600">Loading comparison...</div>
      </div>
    );
  }

  if (!requirement) {
    return (
      <div className="page">
        <div className="page-shell py-8">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-hoko-brand hover:underline"
          >
            {"<- Back"}
          </button>
          <p className="mt-4 text-gray-600">Requirement not found.</p>
        </div>
      </div>
    );
  }

  if (offers.length < 2) {
    return (
      <div className="page">
        <div className="page-shell py-8">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-hoko-brand hover:underline"
          >
            {"<- Back"}
          </button>
          <p className="mt-4 text-gray-600">
            At least 2 offers are required to compare.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-shell py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-hoko-brand hover:underline"
            >
              {"<- Back"}
            </button>
            <h1 className="text-xl font-bold mt-2">Compare Offers</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadPdf}
              className="px-4 py-2 rounded-lg border border-[var(--ui-border)] font-semibold text-sm"
            >
              Download PDF
            </button>
            <button
              onClick={downloadXlsx}
              className="px-4 py-2 rounded-lg btn-primary text-sm font-semibold"
            >
              Download XLSX
            </button>
          </div>
        </div>

        <div className="overflow-auto rounded-xl border border-[var(--ui-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left px-3 py-2 font-semibold border-b border-[var(--ui-border)]">
                  Field
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="text-left px-3 py-2 font-semibold border-b border-[var(--ui-border)]"
                  >
                    {col.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field} className="align-top">
                  <td className="px-3 py-2 border-b border-[var(--ui-border)] font-medium">
                    {row.field}
                  </td>
                  {row.values.map((value, index) => (
                    <td
                      key={`${row.field}-${columns[index]?.key || index}`}
                      className="px-3 py-2 border-b border-[var(--ui-border)] whitespace-pre-wrap"
                    >
                      {formatValue(value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

