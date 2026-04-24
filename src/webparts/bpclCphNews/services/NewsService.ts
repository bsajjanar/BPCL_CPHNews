import { spfi, SPFx } from "@pnp/sp";
import "@pnp/sp/webs";
import "@pnp/sp/lists";
import "@pnp/sp/items";
import "@pnp/sp/fields";
import "@pnp/sp/site-users/web";
import "@pnp/sp/attachments";
import "@pnp/sp/folders";
import "@pnp/sp/files";
import "@pnp/sp/profiles";

import { SPHttpClient } from "@microsoft/sp-http";

import AuditService from "../services/AuditService";


export class NewsService {
  public sp;
  private context: any;

    private auditService: AuditService;

 
  constructor(context: any) {
    this.context = context;
    this.sp = spfi().using(SPFx(context));
    this.auditService = new AuditService(
      this.sp,
      context.pageContext.web.absoluteUrl,
    );

  }
  // getting sita collection admin
  public async isCurrentUserSiteAdmin(): Promise<boolean> {
    try {
      const user = await this.sp.web.currentUser();

      // IsSiteAdmin = true only for Site Collection Admin
      return user?.IsSiteAdmin === true;
    } catch (e) {
      console.log("SiteAdmin check error", e);
      return false;
    }
  }
  // getting dashboard card count
  public async getAllCounts(): Promise<{
    news: number;
    events: number;
    broadcasts: number;
    brands: number;
  }> {
    try {
      let news = 0;
      let events = 0;
      let broadcasts = 0;
      let brands = 0;

      //  Get SBU
      const sbu = await this.getCurrentUserSBUFromGraph();
      if (!sbu) {
        return { news: 0, events: 0, broadcasts: 0, brands: 0 };
      }

      
       let teamName = sbu.trim(); 

      if (teamName === "HRS" || teamName === "HRD" || teamName === "HUMAN RESOURCES") {
        teamName = "HUMAN RESOURCES";
      } 
 
       let safeSbu = ""; 

    if (teamName === "HUMAN RESOURCES") {
      safeSbu = "(SBU eq 'HRS' or SBU eq 'HRD' or SBU eq 'HUMAN RESOURCES')";
    } else {
      safeSbu = `SBU eq '${teamName.replace(/'/g, "''")}'`;
    }
 
      //const safeSbu = sbu.replace(/'/g, "''");

      const items = this.sp.web.lists
        .getByTitle("CorpCommunication")
        .items.select("CommunicationType") 
.filter(`${safeSbu} and Status eq 'Published'`)
        .top(5000);

      //  PnP v3 paging
      for await (const batch of items) {
        batch.forEach((item: any) => {
          const type = item.CommunicationType;

          if (type === "News") news++;
          else if (type === "Event") events++;
          else if (type === "BroadCast") broadcasts++;
          else if (type === "Brand") brands++;
        });
      }

      return { news, events, broadcasts, brands };
    } catch (error) {
      console.error("PnP count error:", error);
      return { news: 0, events: 0, broadcasts: 0, brands: 0 };
    }
  }

  public async getLoggedInUserProfileInfo(): Promise<{
    department: string;
    reportingManagerLogin: string;
    reportingManagerUser?: any;
    sbu: string;
  }> {
    try {
      const me = await this.sp.web.currentUser();
      const profile = await this.sp.profiles.getPropertiesFor(me.LoginName);

      const props = profile.UserProfileProperties || [];

      const dept =
        props.find((p: any) => p.Key === "Department")?.Value ||
        props.find((p: any) => p.Key === "SPS-Department")?.Value ||
        "";

      const managerLogin =
        props.find((p: any) => p.Key === "Manager")?.Value ||
        props.find((p: any) => p.Key === "SPS-Manager")?.Value ||
        "";

      //  SBU from extensionAttribute4
      const sbu = props.find((p: any) => p.Key === "SBU")?.Value || "";

      console.log("SBU:", sbu);

      let managerUser = null;

      if (managerLogin) {
        try {
          managerUser = await this.sp.web.ensureUser(managerLogin); //  FIX
        } catch (e) {
          console.log("Manager ensureUser failed", e);
        }
      }

      return {
        department: dept,
        reportingManagerLogin: managerLogin,
        reportingManagerUser: managerUser,
        sbu: sbu, // returning SBU
      };
    } catch (error) {
      console.error("Error fetching profile info", error);
      return {
        department: "",
        reportingManagerLogin: "",
        reportingManagerUser: null,
        sbu: "",
      };
    }
  }

  // getting sbu values from ad
  public async getCurrentUserSBUFromGraph(): Promise<string> {
  //    const isTestMode = true; // change to false after testing

  // if (isTestMode) {
  //   return "HRD";
  // }    
   
    try {
      const client = await this.context.msGraphClientFactory.getClient("3");

      const user = await client
        .api("/me?$select=onPremisesExtensionAttributes")
        .get();

      return (
        user?.onPremisesExtensionAttributes?.extensionAttribute4?.trim() || ""
      );
    } catch (error) {
      console.error("Error fetching SBU from Graph", error);
      return "";
    }
  }

  // validating sbu wiht the team cm list
  public async isUserPartOfSbuTeam(sbu: string): Promise<boolean> {
    if (!sbu) return false;

    const userId = await this.getCurrentUserId();

     let teamName = sbu.trim();

  if (teamName === "HRS" || teamName === "HRD" || teamName === "HUMAN RESOURCES") {
        teamName = "HUMAN RESOURCES"; 
  }  
 
    const items = await this.sp.web.lists
      .getByTitle("TeamCMList")
      .items.select(
        "TeamName/TeamName",
        "NewsCreators/Id",
        "Approvers/Id", 
        "PrimaryContentManager/Id",
      )
      .expand("TeamName", "NewsCreators", "Approvers", "PrimaryContentManager")
      .filter(`TeamName/TeamName eq '${teamName.replace(/'/g, "''")}'`)();
 
    return items.some(
      (row: any) =>
        row.NewsCreators?.some((u: any) => u.Id === userId) ||
        row.Approvers?.some((u: any) => u.Id === userId) ||
        row.PrimaryContentManager?.some((u: any) => u.Id === userId),
    );
  }

  
  // getting current user role
 private async getCurrentUserRoles(): Promise<string[]> {

  const userId = await this.getCurrentUserId();
  const sbu = await this.getCurrentUserSBUFromGraph();

  let teamName = sbu?.trim();

  if (teamName === "HRS" || teamName === "HRD" || teamName === "HUMAN RESOURCES") {
    teamName = "HUMAN RESOURCES";
  }

  const items = await this.sp.web.lists
    .getByTitle("TeamCMList")
    .items.select(
      "TeamName/TeamName",
      "BrandCreators/Id",
      "Approvers/Id",
      "PrimaryContentManager/Id"
    )
    .expand("TeamName", "BrandCreators", "Approvers", "PrimaryContentManager")
    .filter(`TeamName/TeamName eq '${teamName.replace(/'/g, "''")}'`)();

  const roles: string[] = [];

  for (const item of items) {

    if (item.BrandCreators?.some((u: any) => u.Id === userId)) {
      roles.push("Creator");
    }

    if (item.Approvers?.some((u: any) => u.Id === userId)) {
      roles.push("Approver");
    }

    if (item.PrimaryContentManager?.some((u: any) => u.Id === userId)) {
      roles.push("Content Manager");
    }
  }

  // ES5-safe unique logic
  const uniqueRoles: string[] = [];

  roles.forEach(role => {
    if (uniqueRoles.indexOf(role) === -1) {
      uniqueRoles.push(role);
    }
  });

  return uniqueRoles.length ? uniqueRoles : ["User"];
}

  //  Create news in to the list
  public async saveNews(
    title: string,
    description: string,
    publishIn: string,
    eventDate: string,
    addInfo1: string,
    addInfo2: string,
    addInfo3: string,
    comments: string,
    thumbnailFile: File | null,
    thumbnailCaption: string,
    pic1: File | null, 
    pic2: File | null,
    pic3: File | null,
    picCap1: string,
    picCap2: string,
    picCap3: string,
    approverId: string,
    contentManagerId: string,
    newsType: any,
    viewById: number | null,
    informToBrand: boolean,
    isTransferList: boolean,
    department: string,
    confidentialityIndex: any,
    archivalPolicy: any,
  ): Promise<{ itemId: number; requestNumber: string }> {

    try{

    const sbuText = await this.getCurrentUserSBUFromGraph();

    const result = await this.sp.web.lists
      .getByTitle("CorpCommunication")
      .items.add({
        Title: title,
        MainDescription: description,
        PublishIn: publishIn,
        EventDate: eventDate ? new Date(eventDate) : null,
        AdditionalInformation1: addInfo1,
        AdditionalInformation2: addInfo2,
        AdditionalInformation3: addInfo3,
        Comments: comments,
        Thumbnail: thumbnailFile ? thumbnailFile.name : "",
        ThumbnailCaption: thumbnailCaption,
        Picture1: pic1?.name || "",
        Picture2: pic2?.name || "",
        Picture3: pic3?.name || "",
        Pic1Caption: picCap1,
        Pic2Caption: picCap2,
        Pic3Caption: picCap3,
        NewsTypes: newsType
          ? {
              Label: newsType.name,
              TermGuid: newsType.key,
              WssId: -1,
            }
          : null,

        ConfidentialityIndex: confidentialityIndex
          ? this.getTaxonomyValue(confidentialityIndex)
          : null,

        ArchivalPolicy: archivalPolicy 
          ? this.getTaxonomyValue(archivalPolicy)
          : null,

        AssignToId: approverId ? Number(approverId) : null,
        PendingWithId: approverId ? Number(approverId) : null,
        FollowOnActionById: contentManagerId ? Number(contentManagerId) : null,
        ViewById: viewById ? Number(viewById) : null,
        CommunicationType: "News",
        SBU: sbuText,
        InformToBrand: informToBrand,
        IsTransferList: isTransferList,
        Department: department,
        PublishedDate: new Date().toISOString(),
      });

    // Correct way to get ItemId
    const itemId = result.Id;
    if (!itemId) {
      throw new Error("Item created but ID could not be resolved.");
    }

    //  Generate RequestNumber
    const strId = itemId.toString();
    const padded = ("00000000" + strId).slice(-8); // 8 digits
    const requestNumber = `RQ${padded}`;

    await this.sp.web.lists
      .getByTitle("CorpCommunication")
      .items.getById(itemId)
      .update({
        RequestNumber: requestNumber,
      });

    // Upload attachments

    const baseUrl = `${this.context.pageContext.web.absoluteUrl}/_api/web/lists/getByTitle('CorpCommunication')/items(${itemId})/AttachmentFiles/add(FileName='`;

    if (thumbnailFile) {
      await this.context.spHttpClient.post(
        `${baseUrl}${encodeURIComponent(thumbnailFile.name)}')`,
        SPHttpClient.configurations.v1,
        { body: thumbnailFile },
      );
    }

    if (pic1) {
      await this.context.spHttpClient.post(
        `${baseUrl}${encodeURIComponent(pic1.name)}')`,
        SPHttpClient.configurations.v1,
        { body: pic1 },
      );
    }

    if (pic2) {
      await this.context.spHttpClient.post(
        `${baseUrl}${encodeURIComponent(pic2.name)}')`,
        SPHttpClient.configurations.v1,
        { body: pic2 },
      );
    }

    if (pic3) {
      await this.context.spHttpClient.post(
        `${baseUrl}${encodeURIComponent(pic3.name)}')`,
        SPHttpClient.configurations.v1,
        { body: pic3 },
      );
    }

    
    const roles = await this.getCurrentUserRoles();
const roleString = roles.join(", ");

      await this.auditService.log({
        action: "Create Item",
        operation: "POST",
        statusCode: 200,
        listName: "CorpCommunication",
        itemId: itemId,
        userRole: roleString,
      });

      return { itemId, requestNumber };
    } catch (error) {
      console.error("Create failed", error);

      const roles = await this.getCurrentUserRoles();
const roleString = roles.join(", ");

      //  FAILURE LOG
      await this.auditService.log({
        action: "Create Failed",
        operation: "POST",
        statusCode: 500,
        listName: "CorpCommunication",
        userRole: roleString,
      });

      throw error; 
    } 
  }
  

  public async getExpiryDateById(id: number): Promise<string | null> {
    try {
      const item = await this.sp.web.lists
        .getByTitle("CorpCommunication")
        .items.getById(id)
        .select("ExpiryDate")();

      return item?.ExpiryDate || null;
    } catch (error) {
      console.log("Error fetching ExpiryDate", error);
      return null;
    }
  }

  //  GET Get approvers DATA to dropdown
  public async getApproversByTeam(teamName: string): Promise<any[]> {
    const items = await this.sp.web.lists
      .getByTitle("TeamCMList")
      .items.select(
        "Id",
        "TeamName/TeamName",
        "Approvers/Id",
        "Approvers/Title",
      )
      .expand("TeamName", "Approvers")
      .filter(`TeamName/TeamName eq '${teamName}'`)();

    const users: any[] = [];

    items.forEach((i: any) => {
      if (i.Approvers) {
        if (Array.isArray(i.Approvers)) {
          i.Approvers.forEach((u: any) => users.push(u));
        } else {
          users.push(i.Approvers);
        }
      }
    });

    return users;
  }

  //  GET Get Content Manager DATA dropdown
  public async getContentManagersByTeam(teamName: string): Promise<any[]> {
    const items = await this.sp.web.lists
      .getByTitle("TeamCMList")
      .items.select(
        "Id",
        "TeamName/TeamName",
        "PrimaryContentManager/Id",
        "PrimaryContentManager/Title",
      )
      .expand("TeamName", "PrimaryContentManager")
      .filter(`TeamName/TeamName eq '${teamName}'`)();

    const users: any[] = [];

    items.forEach((i: any) => {
      if (i.PrimaryContentManager) {
        if (Array.isArray(i.PrimaryContentManager)) {
          i.PrimaryContentManager.forEach((u: any) => users.push(u));
        } else {
          users.push(i.PrimaryContentManager);
        }
      }
    });

    return users;
  }

  // GET is NEWS or not
  public async isCurrentUserNewsCreator(): Promise<boolean> {
    const userId = await this.getCurrentUserId();

    const items = await this.sp.web.lists
      .getByTitle("TeamCMList")
      .items.select(
        "Id",
        "IsNewsCreator",
        "IsCorpNewsCreator",
        "NewsCreators/Id",
      )
      .expand("NewsCreators")();

    return items.some((row: any) => {
      // const isNewsCreatorFlag =
      //   row.IsNewsCreator === 1 || row.IsNewsCreator === true;

      // const isCorpCreatorFlag =
      //   row.IsCorpNewsCreator === 1 || row.IsCorpNewsCreator === true;

      const isInCreators = row.NewsCreators?.some((u: any) => u.Id === userId);

      //return isNewsCreatorFlag || isCorpCreatorFlag || isInCreators;
      return isInCreators;
    });
  }

  private normalizeUsers(field: any): any[] {
    if (!field) return [];
    return Array.isArray(field) ? field : [field];
  }

  // create button visiblity
  public async canUserCreateByType(
    teamName: string,
    type: "News" | "BroadCast" | "Event" | "Brand",
  ): Promise<boolean> {
    const currentUser = await this.sp.web.currentUser();
    const currentUserId = currentUser.Id;

    const items = await this.sp.web.lists
      .getByTitle("TeamCMList")
      .items.select(
        "Id",
        "IsNewsCreator",
        "IsBroadcastCreator",
        "IsEventCreator",
        "IsBrandCreator",
        "PrimaryContentManager/Id",
        "Approvers/Id",
        "NewsCreators/Id",
        "BroadcastCreators/Id",
        "EventCreators/Id",
        "BrandCreators/Id",
        "TeamName/TeamName",
      )
      .expand(
        "PrimaryContentManager",
        "Approvers",
        "NewsCreators",
        "BroadcastCreators",
        "EventCreators",
        "BrandCreators",
        "TeamName",
      )
      .filter(`TeamName/TeamName eq '${teamName}'`)();

    if (!items.length) return false;

    for (const item of items) {
      // 🔹 Check if type enabled
      const isTypeEnabled =
        (type === "News" && item.IsNewsCreator === true) ||
        (type === "BroadCast" && item.IsBroadcastCreator === true) ||
        (type === "Event" && item.IsEventCreator === true) ||
        (type === "Brand" && item.IsBrandCreator === true);

      if (!isTypeEnabled) continue;

      const primaryCM = this.normalizeUsers(item.PrimaryContentManager);
      const approvers = this.normalizeUsers(item.Approvers);

      const creators =
        type === "News"
          ? this.normalizeUsers(item.NewsCreators)
          : type === "BroadCast"
            ? this.normalizeUsers(item.BroadcastCreators)
            : type === "Event"
              ? this.normalizeUsers(item.EventCreators)
              : this.normalizeUsers(item.BrandCreators);

      const isPrimaryOrApprover =
        primaryCM.some((u) => u.Id === currentUserId) ||
        approvers.some((u) => u.Id === currentUserId);

      if (isPrimaryOrApprover) return true;

      const isExplicitCreator = creators.some((u) => u.Id === currentUserId);

      if (isExplicitCreator) return true;
    }

    return false;
  }
 
  // GET NEWS LIST DATA
  public async getCurrentUserId(): Promise<number> {
    const me = await this.sp.web.currentUser();
    return me.Id;
  }

  public async getNewsForCreator(
    status: string,
    pageSize: number,
  ): Promise<any[]> {
    const currentUser = await this.sp.web.currentUser();   
    const userId = currentUser.Id; 

    let filterQuery = `Created ge datetime'2024-12-31T00:00:00Z' and CommunicationType eq 'News'`;   
 
    const sbu = await this.getCurrentUserSBUFromGraph();
    let teamName = sbu.trim();

      if (teamName === "HRS" || teamName === "HRD" || teamName === "HUMAN RESOURCES") {
        teamName = "HUMAN RESOURCES";
      }   

if (teamName === "HUMAN RESOURCES") {
    filterQuery += ` and (SBU eq 'HRS' or SBU eq 'HRD' or SBU eq 'HUMAN RESOURCES')`;
} else if (teamName) {
  filterQuery += ` and SBU eq '${teamName.replace(/'/g, "''")}'`;
} 
  
    // if (teamName) {
    //   filterQuery += ` and SBU eq '${teamName.replace(/'/g, "''")}'`;
    // }

    if (status !== "All") {
      if (status === "Draft") {
        filterQuery += `
      and Status eq 'Draft'
      and AuthorId eq ${userId}
    `;
      } else if (status === "Pending") {
        filterQuery += `
      and PendingWithId eq ${userId}
      and (
        Status eq 'PendingWithLM'
        or Status eq 'PendingWithCM'
        or Status eq 'PendingWithCreator'
      )
    `;
      } else if (status === "Approval Queue") {
        filterQuery += `
      and AuthorId eq ${userId}
      and (
        Status eq 'PendingWithLM'
        or Status eq 'PendingWithCM'
      )
    `;
      } else if (status === "Published") {
        filterQuery += `
      and Status eq 'Published'
      and (
        AuthorId eq ${userId}
        or AssignToId eq ${userId}
        or FollowOnActionById eq ${userId}
        or PendingWithId eq ${userId}
      )
    `;
      } else if (status === "View Requests") {
        filterQuery += `
    and (
      (
        AuthorId eq ${userId} and (
          Status eq 'Draft'
          or Status eq 'PendingWithLM'
          or Status eq 'PendingWithCM'
          or Status eq 'PendingWithCreator'
          or Status eq 'Published'
          or Status eq 'Rejected'
        )
      )
      or
      (
        AssignToId eq ${userId} and (
          Status eq 'PendingWithLM'
          or Status eq 'PendingWithCM'
          or Status eq 'Published'
          or Status eq 'Rejected'
          or Status eq 'PendingWithCreator'

        )
      )
      or
      (
        FollowOnActionById eq ${userId} and (
          Status eq 'PendingWithCM'
          or Status eq 'Published'
          or Status eq 'Rejected'
          or Status eq 'PendingWithLM'

        )
      )
      or
      (
        PendingWithId eq ${userId} and (
          Status eq 'PendingWithLM'
          or Status eq 'PendingWithCM'
          or Status eq 'Published'
          or Status eq 'Rejected'
          or Status eq 'PendingWithCreator'

        )
      )
    )
  `;
      }
    } 

    const items = await this.sp.web.lists
      .getByTitle("CorpCommunication")
      .items.select(
        "Id",
        "Title",
        "SBU",
        "CommunicationType",
        "MainDescription",
        "PublishIn",

        "ExpiryDate",
        "EventDate",
        "NewsTypes",

        "NewsTypes/Label",
        "NewsTypes/TermGuid",

        "AssignToId",
        "PendingWithId",
        "FollowOnActionById",
        "ViewById",

        "InformToBrand",
        "IsReassigned",

        "Thumbnail",
        "ThumbnailCaption",

        "Picture1",
        "Pic1Caption",
        "Picture2",
        "Pic2Caption",
        "Picture3",
        "Pic3Caption",

        "AdditionalInformation1",
        "AdditionalInformation2",
        "AdditionalInformation3",

        "Comments",

        "Created",
        "Status",
        "PublishedDate",

        "AuthorId",
        "Author/Title",
        "PendingWith/Title",
        "AttachmentFiles/FileName",
        "AttachmentFiles/ServerRelativeUrl",
      )
      .expand("Author", "PendingWith", "AttachmentFiles")
      .filter(filterQuery)
      .orderBy("Created", false)
      .top(pageSize)();

    return items.map((it: any) => {
      const files = it.AttachmentFiles || [];

      const thumbFile = files.find(
        (f: any) =>
          f.FileName?.toLowerCase() === (it.Thumbnail || "").toLowerCase(),
      );

      let thumbUrl = "";

      if (thumbFile?.ServerRelativeUrl) {
        // force refresh to avoid browser cache
        thumbUrl = thumbFile.ServerRelativeUrl + `?v=${new Date().getTime()}`;
      }

      return {
        ...it,
        ThumbnailUrl: thumbUrl,
      };
    });
  }

  // Delete LIST ITEM

  // public async deleteNewsPermanently(id: number): Promise<void> {
  //   await this.sp.web.lists
  //     .getByTitle("CorpCommunication")
  //     .items.getById(id)
  //     .delete();
  // }

   // deleteing permanently
  public async deleteNewsPermanently(id: number): Promise<void> {
    try {
      await this.sp.web.lists
        .getByTitle("CorpCommunication")
        .items.getById(id)
        .delete();

     const roles = await this.getCurrentUserRoles();
const roleString = roles.join(", ");

      //  SUCCESS
      await this.auditService.log({
        action: "Delete Item",
        operation: "DELETE",
        statusCode: 200,
        listName: "CorpCommunication",
        itemId: id,
        userRole: roleString,
      });
    } catch (error) {

      const roles = await this.getCurrentUserRoles();
const roleString = roles.join(", ");
      //  FAILURE
      await this.auditService.log({
        action: "Delete Failed",
        operation: "DELETE",
        statusCode: 500,
        listName: "CorpCommunication",
        itemId: id,
        userRole: roleString,
      });

      throw error;
    }
  }

  // UPDATE LIST ITEM
  public async updateNews(id: number, payload: any) {
   
        try {
      await this.sp.web.lists
        .getByTitle("CorpCommunication")
        .items.getById(id)
        .update(payload);

      //  Determine action based on Status
      let actionName = "Update Item";

      const status = payload?.Status;
const reassigned = payload?.IsReassigned ?? false;

      if (status === "PendingWithLM" && reassigned === false) {
        actionName = "Submit Item";
      } else if (status === "Rejected") {
        actionName = "Reject Item";
      } else if (status === "PendingWithCreator") {
        actionName = "Reassign Item";
      } else if (status === "PendingWithCM") {
        actionName = "Approve Item";
      } else if (status === "Published") {
        actionName = "Approve Item";
      } else if (status === "PendingWithLM" && reassigned === true) {
        actionName = "Reassign Item";
      }

const roles = await this.getCurrentUserRoles();
const roleString = roles.join(", ");
      //  SUCCESS LOG
      await this.auditService.log({
        action: actionName,
        operation: "POST",
        statusCode: 200,
        listName: "CorpCommunication",
        itemId: id,
        userRole: roleString,
      });
    } catch (error) {
      console.error("Update failed", error);

      //  FAILURE LOG (also dynamic)
      let failAction = "Update Failed";

      const status = payload?.Status;
const reassigned = payload?.IsReassigned ?? false;

      if (status === "PendingWithLM" && reassigned === false) {
        failAction = "Submit Failed";
      } else if (status === "Rejected") {
        failAction = "Reject Failed";
      } else if (status === "PendingWithCreator") {
        failAction = "Reassign Failed";
      } else if (status === "PendingWithCM") {
        failAction = "Approve Failed";
      } else if (status === "PendingWithLM" && reassigned === true) {
        failAction = "Reassign Failed";
      } else if (status === "Published") {
        failAction = "Approve Failed";
      } 
 
const roles = await this.getCurrentUserRoles();
const roleString = roles.join(", ");

      await this.auditService.log({
        action: failAction,
        operation: "POST",
        statusCode: 500,
        listName: "CorpCommunication",
        itemId: id,
        userRole: roleString,
      });

      throw error;
    }
  }
   

  // upload and delete the attchmentts
  public async uploadAttachments(itemId: number, files: File[]) {
    const item = this.sp.web.lists
      .getByTitle("CorpCommunication")
      .items.getById(itemId);

    const existingFiles = await item.attachmentFiles();

    for (const file of files) {
      const alreadyExists = existingFiles.find((f) => f.FileName === file.name);

      if (alreadyExists) {
        await item.attachmentFiles.getByName(file.name).delete();
        await new Promise((r) => setTimeout(r, 200));
      }

      await item.attachmentFiles.add(file.name, file);
    }
  }

  // Get attachments
  public async getAttachmentLinks(
    itemId: number,
  ): Promise<{ FileName: string; ServerRelativeUrl: string }[]> {
    const files = await this.sp.web.lists
      .getByTitle("CorpCommunication")
      .items.getById(itemId)
      .attachmentFiles();

    return files.map((f: any) => ({
      FileName: f.FileName,
      ServerRelativeUrl: f.ServerRelativeUrl,
    }));
  }
  //  People picker helper
  public async getUserEmailById(userId: number): Promise<string> {
    const user = await this.sp.web.siteUsers.getById(userId)();
    return user?.Email || "";
  }
 
  // TermSetId
  public async getTermSetId(fieldInternalName: string): Promise<string> {
    const field: any = await this.sp.web.lists
      .getByTitle("CorpCommunication")
      .fields.getByInternalNameOrTitle(fieldInternalName)();

    return field.TermSetId;
  }

  //  taxonomy helper
  // public getTaxonomyValue(term: any) {
  //   if (!term) return null;

  //   return {
  //     Label: term.Label,
  //     TermGuid: term.TermGuid,
  //     WssId: -1,
  //   };
  // }
  public getTaxonomyValue(term: any) {
  if (!term) return null;

  return {
    Label: term.Label || term.text,
    TermGuid: term.TermGuid || term.key,
    WssId: -1,
  };
} 

  public async getTermSetTerms(
    termSetId: string,
  ): Promise<{ key: string; text: string }[]> {
    const url =
      `${this.context.pageContext.web.absoluteUrl}` +
      `/_api/v2.1/termStore/sets/${termSetId}/terms?$select=id,labels`;

    const response = await this.context.spHttpClient.get(
      url,
      SPHttpClient.configurations.v1,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to load terms: ${response.status} - ${text}`);
    }

    const json = await response.json();

    // json.value contains terms
    return (json.value || []).map((t: any) => ({
      key: t.id,
      text: t.labels?.[0]?.name || t.id,
    }));
  }
  // role check
  //  check if current user is Approver for the team
  public async isCurrentUserApprover(teamName: string): Promise<boolean> {
    const userId = await this.getCurrentUserId();

    const items = await this.sp.web.lists
      .getByTitle("TeamCMList")
      .items.select("Id", "Approvers/Id", "TeamName/TeamName")
      .expand("Approvers", "TeamName")
      .filter(`TeamName/TeamName eq '${teamName}'`)();

    return items.some((row: any) =>
      row.Approvers?.some((u: any) => u.Id === userId),
    );
  }

  // check if current user is PrimaryContentManager for the team
  public async isCurrentUserPrimaryContentManager(
    teamName: string,
  ): Promise<boolean> {
    const userId = await this.getCurrentUserId();

    const items = await this.sp.web.lists
      .getByTitle("TeamCMList")
      .items.select("Id", "PrimaryContentManager/Id", "TeamName/TeamName")
      .expand("PrimaryContentManager", "TeamName")
      .filter(`TeamName/TeamName eq '${teamName}'`)();

    return items.some((row: any) =>
      row.PrimaryContentManager?.some((u: any) => u.Id === userId),
    );
  }

    // Check existing files from transferlist images library
  public async createFolderIfNotExists(
    libraryName: string,
    folderName: string,
  ): Promise<void> {
    try {
      const serverUrl = this.context.pageContext.web.serverRelativeUrl;
      const folderPath = `${serverUrl}/${libraryName}/${folderName}`;

      // Try getting folder
      await this.sp.web.getFolderByServerRelativePath(folderPath)();

      console.log("Folder already exists:", folderName);
    } catch {
      // If not exists → create
      await this.sp.web.lists
        .getByTitle(libraryName)
        .rootFolder.folders.addUsingPath(folderName);

      console.log("Folder created:", folderName);
    }
  }
 
    // getting files from transferlist images library data
  public async getTransferImagesByCorpId(corpId: number): Promise<any[]> {
    const folderPath = `${this.context.pageContext.web.serverRelativeUrl}/TransferListImages/${corpId}`;

    return await this.sp.web
      .getFolderByServerRelativePath(folderPath)
      .files.select("Name", "ServerRelativeUrl")();
  }

  // getting files from transfersbuindexlist data
  public async getTransferSbuIndexesByCorpId(corpId: number): Promise<any[]> {
    const listTitle = "TransferSbuIndexList";
    const folderTitle = corpId.toString();

    // 1️ Get real folder path (FileRef) using Title
    const folderItems = await this.sp.web.lists
      .getByTitle(listTitle)
      .items.filter(`Title eq '${folderTitle}' and FSObjType eq 1`)
      .select("FileRef")();

    if (!folderItems || folderItems.length === 0) {
      console.log("Folder not found");
      return [];
    }

    const realFolderPath = folderItems[0].FileRef;

    // 2️ Get items inside that folder using real internal path
    const items = await this.sp.web.lists
      .getByTitle(listTitle)
      .items.select("Id", "StartIndex", "SBU/Id", "SBU/TeamName", "FileDirRef")
      .expand("SBU")
      .filter(`startswith(FileDirRef,'${realFolderPath}')`)
      .orderBy("Id", true)();

    return items;
  } 

  public async getTermNameFromHiddenList(guid: string): Promise<string> {
    try {
      const items = await this.sp.web.lists
        .getByTitle("TaxonomyHiddenList")
        .items.filter(`IdForTerm eq '${guid}'`)
        .select("Term") 
        .top(1)();

      return items?.[0]?.Term || "";
    } catch (e) {
      console.log("HiddenList term fetch error", e);
      return "";
    }
  }
}
