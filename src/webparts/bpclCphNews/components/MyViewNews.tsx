import * as React from "react";
import { useEffect, useState } from "react";
//import "@fontsource/inter";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import styles from "./MyViewNews.module.scss";

// import { NewsService } from "../services/NewsService";
import { NewsService } from "../services/NewsService";
import NewsTable from "./NewsTable";
import CreateNews from "./CreateNews";
import NewsEditForm from "./NewsEditForm";
import PopupModal from "../services/PopupModel";
import PreviewNewsModal from "./PreviewNewsModal";
import StaffPostingPreviewModal from "./StaffPostingPreviewModal";


export interface IMyViewNewsProps {
  sp: any;
  context: any;
} 

export interface ITaxonomyFieldValue {
  Label: string;
  TermGuid: string;
  WssId?: number;
}

export interface INewsForm {
  Title: string;
  MainDescription: string;

  PublishIn: string;

  NewsTypes: ITaxonomyFieldValue | null;
  ConfidentialityIndex?: ITaxonomyFieldValue | null;
  ArchivalPolicy?: ITaxonomyFieldValue | null;

  ExpiryDate: string;
  EventDate: string;

  AssignTo: number[];
  PendingWith: number[];
  FollowOnActionBy: number[];

  ViewBy: number[];

  InformToBrand: boolean;

  Thumbnail: string;
  ThumbnailCaption: string;

  Picture1: string;
  Pic1Caption: string;
  Picture2: string;
  Pic2Caption: string;
  Picture3: string;
  Pic3Caption: string;

  AdditionalInformation1: string;
  AdditionalInformation2: string;
  AdditionalInformation3: string;

  Comments: string;
  Status?: string;
  AuthorId?: number;
} 

const MyViewNews: React.FC<IMyViewNewsProps> = ({ sp, context }) => {
  const service = new NewsService(context);

  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState("Draft");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);


  const [view, setView] = useState<"list" | "create" | "edit">("list");

  const [isSiteAdmin, setIsSiteAdmin] = useState(false);

  const [editId, setEditId] = useState<number | null>(null);

  const [termSetNewsTypesId, setTermSetNewsTypesId] = useState<string>("");



  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [pic1File, setPic1File] = useState<File | null>(null);
  const [pic2File, setPic2File] = useState<File | null>(null);
  const [pic3File, setPic3File] = useState<File | null>(null);

  const [showPopup, setShowPopup] = useState<boolean>(false);
  const [popupMessage, setPopupMessage] = useState<string>("");
  const [popupType, setPopupType] = useState<"success" | "danger" | "confirm">(
    "success",
  );

  const [showPreview, setShowPreview] = useState(false);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [previewAttachments, setPreviewAttachments] = useState<any[]>([]);

  const [canCreateNews, setCanCreateNews] = useState(false);


  const [showStaffPostingPreview, setShowStaffPostingPreview] = useState(false);

  const [attachmentLinks, setAttachmentLinks] = useState<
    { FileName: string; ServerRelativeUrl: string }[]
  >([]);

  const [form, setForm] = useState<INewsForm>({
    Title: "",
    MainDescription: "",

    PublishIn: "",

    NewsTypes: null,

    ExpiryDate: "",
    EventDate: "",

    AssignTo: [],
    PendingWith: [],
    FollowOnActionBy: [],
    ViewBy: [],

    InformToBrand: false,

    Thumbnail: "",
    ThumbnailCaption: "",

    Picture1: "",
    Pic1Caption: "",
    Picture2: "",
    Pic2Caption: "",
    Picture3: "",
    Pic3Caption: "",

    AdditionalInformation1: "",
    AdditionalInformation2: "",
    AdditionalInformation3: "",

    Comments: "",
  });



  const openPreviewPopup = async (id: number, item?: any) => {
    const links = await service.getAttachmentLinks(id);
    setPreviewAttachments([...links]); // force React refresh
    const finalItem = item ? item : { ...form, Id: id };
    setPreviewItem(finalItem);

    let isStaffPosting = false;

    const termGuid = finalItem?.NewsTypes?.TermGuid;

    if (termGuid) {
      const termName = await service.getTermNameFromHiddenList(termGuid);

      const normalized = (termName || "")
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");

      if (normalized === "staffposting") {
        isStaffPosting = true;
      }
    }

    setShowPreview(false);
    setShowStaffPostingPreview(false);

    if (isStaffPosting) {
      setShowStaffPostingPreview(true);
    } else {
      setShowPreview(true);
    }
  };

  useEffect(() => {
  const loadAdmin = async () => {
    const admin = await service.isCurrentUserSiteAdmin();
    setIsSiteAdmin(admin);
  };

  loadAdmin();
}, []);

  const openEditPreviewPopup = async () => {
    if (!editId) return;

    await openPreviewPopup(editId, { ...form, Id: editId });
  };


  const loadNews = async () => {
  try {

        setIsLoading(true); //  START loading


    const sbu = await service.getCurrentUserSBUFromGraph();

    // 1️ No SBU → block everything
    if (!sbu) {
      setCanCreateNews(false);
      setItems([]);
      return;
    }

     let teamName = sbu.trim();

      if (teamName === "HRS" || teamName === "HRD" || teamName === "HUMAN RESOURCES") {
        teamName = "HUMAN RESOURCES";
      } 

    // 2️ Validate user is mapped in TeamCMList
    const isValid = await service.isUserPartOfSbuTeam(teamName);

    if (!isValid) {
      setCanCreateNews(false); 
      setItems([]);
       console.log("User not mapped in TeamCMList"); 
        //showError("User not mapped in TeamCMList.");  
      return;
    } 

    // 3️ Role-based create permission
    const canCreate = await service.canUserCreateByType(teamName, "News");
    setCanCreateNews(canCreate);

    // 4️ Load data (SBU filtering already handled inside service) 
    const data = await service.getNewsForCreator(status, 500);   

    setItems(data);

  } catch (err) {
    console.log("Error loading news", err);
  } finally {
    setIsLoading(false); //  END loading
  }
};   

  useEffect(() => {
    loadNews();
  }, [status]); 

  useEffect(() => {
    (async () => {
      try {
        const newsTypesId = await service.getTermSetId("NewsTypes");
        setTermSetNewsTypesId(newsTypesId);
      } catch (e) {
        console.log("TermSetId load error", e);
      }
    })();
  }, []);

  const openEdit = async (item: any) => {
    setEditId(item.Id);

    setThumbnailFile(null);
    setPic1File(null);
    setPic2File(null);
    setPic3File(null);

    setForm({
      Title: item.Title || "",
      MainDescription: item.MainDescription || item.Description || "",

      PublishIn: item.PublishIn || "",

      NewsTypes: item.NewsTypes || null,
      ConfidentialityIndex: item.ConfidentialityIndex || null,
      ArchivalPolicy: item.ArchivalPolicy || null,

      ExpiryDate: item.ExpiryDate ? item.ExpiryDate.split("T")[0] : "",
      EventDate: item.EventDate ? item.EventDate.split("T")[0] : "",

      AssignTo: item.AssignToId ? [item.AssignToId] : [],
      PendingWith: item.PendingWithId ? [item.PendingWithId] : [],
      FollowOnActionBy: item.FollowOnActionById
        ? [item.FollowOnActionById]
        : [],
      ViewBy: item.ViewById ? [item.ViewById] : [],
      AuthorId: item.AuthorId || item.Author?.Id || null,

      InformToBrand: item.InformToBrand || false,

      Thumbnail: item.Thumbnail || "",
      ThumbnailCaption: item.ThumbnailCaption || "",

      Picture1: item.Picture1 || "",
      Pic1Caption: item.Pic1Caption || "",
      Picture2: item.Picture2 || "",
      Pic2Caption: item.Pic2Caption || "",
      Picture3: item.Picture3 || "",
      Pic3Caption: item.Pic3Caption || "",

      AdditionalInformation1: item.AdditionalInformation1 || "",
      AdditionalInformation2: item.AdditionalInformation2 || "",
      AdditionalInformation3: item.AdditionalInformation3 || "",

      Comments: item.Comments || "",

      Status: item.Status || "",
    });

  

    const links = await service.getAttachmentLinks(item.Id);
    setAttachmentLinks(links);

    setView("edit");
  };

  // validation
  const showError = (msg: string) => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setPopupType("danger");
    setPopupMessage(msg);
    setShowPopup(true);
  };

 const normalizeQuillHtml = (html: string): string => {
  if (!html) return "";

  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  // Remove empty paragraphs
  tempDiv.querySelectorAll("p").forEach((p) => {
    const text = (p.textContent || "").trim();
    if (!text && !p.querySelector("img") && !p.querySelector("br")) {
      p.remove();
    }
  });

  // Fix Quill nested list structure safely
  const allLists = tempDiv.querySelectorAll("ul, ol");

  allLists.forEach((list) => {
    const items = Array.from(list.children) as HTMLElement[];
    let currentParentLi: HTMLElement | null = null;
    let nestedList: HTMLElement | null = null;

    items.forEach((item) => {
      if (item.tagName !== "LI") return;

      const li = item as HTMLElement;
      const isIndented =
        li.classList.contains("ql-indent-1") ||
        li.classList.contains("ql-indent-2") ||
        li.classList.contains("ql-indent-3");

      if (!isIndented) {
        currentParentLi = li;
        nestedList = null;
      } else if (currentParentLi) {
        if (!nestedList) {
          nestedList = document.createElement(list.tagName.toLowerCase());
          currentParentLi.appendChild(nestedList);
        }

        li.classList.remove("ql-indent-1", "ql-indent-2", "ql-indent-3");
        nestedList.appendChild(li);
      }
    });
  });

  return tempDiv.innerHTML;
}; 

  const saveDraft = async () => {
    if (!editId) {
      setPopupType("danger");
      setPopupMessage("EditId missing.");
      setShowPopup(true);
      return;
    }

    const currentUserId = await service.getCurrentUserId();

    // If logged-in user is PendingWith → Approver saving
    const isApproverSaving = form.PendingWith?.[0] === currentUserId;

    const selectedTerm = form.NewsTypes ?? null;

const isTransferList =
  selectedTerm?.Label?.trim().toLowerCase() === "staff posting";

    const payload: any = {
      Title: form.Title,
      // MainDescription: form.MainDescription,
      MainDescription: normalizeQuillHtml(form.MainDescription),
      PublishIn: form.PublishIn,

      NewsTypes: form.NewsTypes
        ? service.getTaxonomyValue(form.NewsTypes)
        : null,

      // ConfidentialityIndex: form.ConfidentialityIndex
      //   ? service.getTaxonomyValue(form.ConfidentialityIndex)
      //   : null,

      // ArchivalPolicy: form.ArchivalPolicy
      //   ? service.getTaxonomyValue(form.ArchivalPolicy)
      //   : null,

      EventDate: form.EventDate ? new Date(form.EventDate).toISOString() : null,

      AssignToId: form.AssignTo?.[0] || null,
      PendingWithId: isApproverSaving
        ? form.PendingWith?.[0] || null // keep current pending owner
        : form.AssignTo?.[0] || null, // creator draft → LM
      FollowOnActionById: form.FollowOnActionBy?.[0] || null,
      ViewById: form.ViewBy?.[0] || null,

      InformToBrand: form.InformToBrand,

      Thumbnail: thumbnailFile ? thumbnailFile.name : form.Thumbnail,
      ThumbnailCaption: form.ThumbnailCaption,

      Picture1: pic1File ? pic1File.name : form.Picture1,
      Pic1Caption: form.Pic1Caption,

      Picture2: pic2File ? pic2File.name : form.Picture2,
      Pic2Caption: form.Pic2Caption,

      Picture3: pic3File ? pic3File.name : form.Picture3,
      Pic3Caption: form.Pic3Caption,

      AdditionalInformation1: form.AdditionalInformation1,
      AdditionalInformation2: form.AdditionalInformation2,
      AdditionalInformation3: form.AdditionalInformation3,

      Comments: form.Comments,
      IsTransferList: isTransferList,

    };

    //  Only Creator should change to Draft
    if (!isApproverSaving) {
      payload.Status = "Draft";
    }

  
    
await service.updateNews(editId, payload);
 if (selectedTerm?.Label?.trim().toLowerCase() === "staff posting") {
      } 
await new Promise(r => setTimeout(r, 300));

const newFiles: File[] = [];

if (thumbnailFile) newFiles.push(thumbnailFile);
if (pic1File) newFiles.push(pic1File);
if (pic2File) newFiles.push(pic2File);
if (pic3File) newFiles.push(pic3File);

if (newFiles.length > 0) {
  await service.uploadAttachments(editId, newFiles);
} 

   
    /* ================= REFRESH ================= */

    const links = await service.getAttachmentLinks(editId);
    setAttachmentLinks(links);

    const formatRequestNumber = (id: number) => {
      if (!id) return "-";
      const padded = ("00000000" + id.toString()).slice(-8);
      return `RQ${padded}`;
    };

    setPopupType("success");
    setPopupMessage(
      `Request Number: ${formatRequestNumber(editId)} saved successfully.`,
    );
    setShowPopup(true);

    loadNews();
    setView("list");
  };

  const submitNews = async () => {
    if (!editId) return;

    /* ---------- REQUIRED FIELD VALIDATION ---------- */

    if (!form.Title?.trim()) return showError("Title is required");

    if (form.Title.length > 255) {
      return showError("Title should not exceed 255 characters.");
          } 

    if (!form.MainDescription || form.MainDescription === "<p><br></p>")
      return showError("Description is required");

    if (!form.PublishIn) return showError("Publish In is required");

    if (!form.NewsTypes) return showError("News Type is required");

    if (!form.EventDate) return showError("Event Date is required");

    if (!form.AssignTo?.length) return showError("Approver is required");

    if (!form.FollowOnActionBy?.length)
      return showError("Content Manager is required");

    /* ---------- THUMBNAIL REQUIRED ---------- */

    if (!form.Thumbnail && !thumbnailFile)
      return showError("Thumbnail is required (less than 2MB)");

    const selectedTerm = form.NewsTypes ?? null;

const isTransferList =
  selectedTerm?.Label?.trim().toLowerCase() === "staff posting";

    await service.updateNews(editId, {
      Title: form.Title,
      MainDescription: normalizeQuillHtml(form.MainDescription), 
      PublishIn: form.PublishIn,
      NewsTypes: form.NewsTypes
        ? service.getTaxonomyValue(form.NewsTypes)
        : null,

      // ConfidentialityIndex: form.ConfidentialityIndex
      //   ? service.getTaxonomyValue(form.ConfidentialityIndex)
      //   : null,

      // ArchivalPolicy: form.ArchivalPolicy
      //   ? service.getTaxonomyValue(form.ArchivalPolicy)
      //   : null,

      EventDate: form.EventDate ? new Date(form.EventDate).toISOString() : null,

      AssignToId: form.AssignTo?.[0] || null,
      PendingWithId: form.AssignTo?.[0] || null,
      FollowOnActionById: form.FollowOnActionBy?.[0] || null,

      ViewById: form.ViewBy?.[0] || null,

      InformToBrand: form.InformToBrand,

      Thumbnail: thumbnailFile ? thumbnailFile.name : form.Thumbnail,
      ThumbnailCaption: form.ThumbnailCaption,

      Picture1: pic1File ? pic1File.name : form.Picture1,
      Pic1Caption: form.Pic1Caption,

      Picture2: pic2File ? pic2File.name : form.Picture2,
      Pic2Caption: form.Pic2Caption,

      Picture3: pic3File ? pic3File.name : form.Picture3,
      Pic3Caption: form.Pic3Caption,

      AdditionalInformation1: form.AdditionalInformation1,
      AdditionalInformation2: form.AdditionalInformation2,
      AdditionalInformation3: form.AdditionalInformation3,

      Comments: form.Comments,

      Status: "PendingWithLM",
      IsTransferList: isTransferList, 

    }); 

    
    

   await new Promise((r) => setTimeout(r, 300));
const newFiles: File[] = [];

if (thumbnailFile) newFiles.push(thumbnailFile);
if (pic1File) newFiles.push(pic1File);
if (pic2File) newFiles.push(pic2File);
if (pic3File) newFiles.push(pic3File);

if (newFiles.length > 0) {
  await service.uploadAttachments(editId, newFiles);
} 

// wait for SharePoint calculated column to update
await new Promise((r) => setTimeout(r, 800));

const expiry = await service.getExpiryDateById(editId);

if (expiry) {
  setForm((prev) => ({
    ...prev,
    ExpiryDate: expiry.split("T")[0],
  }));
}

    /* ================= REFRESH ================= */

    const links = await service.getAttachmentLinks(editId);
    setAttachmentLinks(links);

    const formatRequestNumber = (id: number) => {
      if (!id) return "-";
      const padded = ("00000000" + id.toString()).slice(-8);
      return `RQ${padded}`;
    };

    setPopupType("success");
    setPopupMessage(
      `Request Number: ${formatRequestNumber(editId)} submitted successfully.`,
    );
    setShowPopup(true);

    loadNews();
    setView("list");
  };
 
  return (
    <div className={styles.wrapper}>
      {/* LIST */}
      {view === "list" && (
        <NewsTable
          context={context}
          items={items}
            isLoading={isLoading}
          selectedStatus={status}
          search={search}
          onStatusChange={setStatus}
          onSearchChange={setSearch}
            isSiteAdmin={isSiteAdmin}

          onEdit={openEdit} 
          onCreate={() => {
            setView("create");
          }}
          canCreateNews={canCreateNews}
          onPreviewPopup={(item: any) => openPreviewPopup(item.Id, item)}
        />
      )}

      {/* CREATE */}
      {view === "create" && (
        <CreateNews
          service={service}
          context={context}
          form={form}
          setForm={setForm}
          onBack={() => {
            setView("list");
          }}
          onSaveDraft={saveDraft}
          onSubmit={submitNews}
          termSetNewsTypesId={termSetNewsTypesId}
          setThumbnailFile={setThumbnailFile}
          setPic1File={setPic1File}
          setPic2File={setPic2File}
          setPic3File={setPic3File}
          attachmentLinks={attachmentLinks}
          onEditAfterSave={async (newId: number) => {
            await loadNews();

            const latest = await service.getNewsForCreator("All", 500);  
            const createdItem = latest.find((x: any) => x.Id === newId);

            if (createdItem) {
              await openEdit(createdItem);
            } else {
              setEditId(newId);
              setView("edit");
            }
          }}
        />
      )}

      {/* EDIT  */}
      {view === "edit" && (
        <NewsEditForm
          service={service}
          context={context}
          form={form}
          setForm={setForm}
          editId={editId}
          onBack={async () => {
            await loadNews();
            setView("list");
          }}
          onPreviewPopup={openEditPreviewPopup}
          onSaveDraft={saveDraft}
          onSubmit={submitNews}
          refreshList={loadNews} //refresh
          termSetNewsTypesId={termSetNewsTypesId}
          thumbnailFile={thumbnailFile}
          pic1File={pic1File}
          pic2File={pic2File}
          pic3File={pic3File}
          setThumbnailFile={setThumbnailFile}
          setPic1File={setPic1File}
          setPic2File={setPic2File}
          setPic3File={setPic3File}
          attachmentLinks={attachmentLinks}
        />
      )}

      {/* Modal PREVIEW */}
      <PreviewNewsModal
        show={showPreview}
        onClose={() => setShowPreview(false)}
        item={previewItem}
        attachments={previewAttachments}
      />

      <StaffPostingPreviewModal
        show={showStaffPostingPreview}
        onClose={() => setShowStaffPostingPreview(false)}
        corpItemId={previewItem?.Id || 0}
        service={service}
      />

      {/* Msg */}
      <PopupModal
        show={showPopup}
        type={popupType}
        message={popupMessage}
        onClose={() => setShowPopup(false)}
      />
    </div>
  );
};
 
export default MyViewNews; 
  