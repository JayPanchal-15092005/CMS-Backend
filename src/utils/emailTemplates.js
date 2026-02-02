/* ==============================================
   src/utils/emailTemplates.js
   (Stores HTML Designs for Emails)
============================================== */

// Template 1: For the Manager (New Complaint)
const getNewComplaintTemplate = (data) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #fff;">
      <div style="text-align: center; padding: 20px; background-color: #f8f9fa; border-bottom: 1px solid #e0e0e0;">
        <h2 style="color: #333; margin: 0;">New Complaint Received</h2>
      </div>
      
      <div style="padding: 20px;">
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Email Address</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px; color: #0056b3;">
            <a href="mailto:${data.email}" style="color: #0056b3; text-decoration: none;">${data.email || "N/A"}</a>
          </div>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Full Name</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.name || "Anonymous"}</div>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Department</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.department}</div>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Complain Type / Details</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.detail}</div>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Assets</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.assets ? JSON.parse(data.assets).join(", ") : "None"}</div>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Complain Location</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.location || "N/A"}</div>
        </div>
        
         <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">To Whom</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.to_whom || "N/A"}</div>
        </div>

         <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Priority</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.priority || "Medium"}</div>
        </div>
      </div>
    </div>
  `;
};

// Template 2: For the Employee (Resolved)
const getResolvedTemplate = (data) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden; background-color: #fff;">
      <div style="text-align: center; padding: 20px;">
        <h2 style="color: #28a745; margin: 0;">Your Complaint has been Resolved</h2>
      </div>
      
      <div style="padding: 20px;">
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Email Address</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px; color: #0056b3;">
             <a href="mailto:${data.email}" style="color: #0056b3; text-decoration: none;">${data.email}</a>
          </div>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Full Name</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.name}</div>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Complain Detail</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px; background-color: #f9f9f9;">${data.detail}</div>
        </div>
        
        <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Admin Remarks</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px; background-color: #e8f5e9; color: #155724;">${data.remarks || "No remarks provided."}</div>
        </div>

         <div style="margin-bottom: 15px;">
          <label style="font-weight: bold; color: #555; display: block; margin-bottom: 5px;">Complain Location</label>
          <div style="border: 1px solid #ccc; padding: 10px; border-radius: 4px;">${data.location || "N/A"}</div>
        </div>
      </div>
    </div>
  `;
};

// module.exports = { getNewComplaintTemplate, getResolvedTemplate };
export {
    getNewComplaintTemplate, 
    getResolvedTemplate
}