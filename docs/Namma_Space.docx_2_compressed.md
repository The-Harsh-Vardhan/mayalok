

<!-- Start of picture text -->
IF Techfest Techfest, IIT Bombay<br>Asia’s Largest Science & Technology Festival<br><!-- End of picture text -->

# **Techfest 2026-27** 

# **Namma Space** 

## **Objective:** 

From time to time there have been shifts in the trends of the world. Earlier, the idea was that there is a possibility people moving to physical spaces will become obsolete, but it has not happened yet, which shows that despite everything being available online, there is an intrinsically better feel when people see physical spaces. But as the online world is growing, at the scale at which businesses want to grow, being digital is a vital part of it. Can we make something which is the best of both worlds? 

**Namma Space** challenges participants to break this barrier. Your mission is to build an end-to-end intelligent spatial engine that converts standard captures of real indoor environments into photorealistic, interactive 3D digital twins. The vision is to completely replace static, outdated 2D blueprints with a scalable, automated pipeline. 

Imagine stepping into a sprawling IKEA or a massive corporate event space and not knowing where to go. Instead of deciphering a complex floor plan, users simply click a link and are instantly immersed in a 3D web environment. The platform must enable remote visitors to conduct seamless virtual walkthroughs, tag and search spatial Points of Interest (POIs), and calculate non-colliding walkable paths through an accessible web interface. Ultimately, this engine should guide users directly to their destination with the same intuitive ease that Google Maps provides for the outdoors, successfully routing users around physical obstacles like walls and furniture. 

## **Challenge Question:** 

How would you design and build a complete software pipeline that turns ordinary smartphone photos or videos of an indoor space into an interactive 3D web application: one that lets remote users freely explore the space in first person, search for a specific room or item and jump straight to it, and see the best walking path to reach it around real physical obstacles? 



<!-- Start of picture text -->
—<br>Techfest Office, Students’ Activity Centre,  www.techfest.org<br>IIT Bombay, Mumbai - 400076<br><!-- End of picture text -->



<!-- Start of picture text -->
IF Techfest Techfest, IIT Bombay<br>Asia’s Largest Science & Technology Festival<br><!-- End of picture text -->

Build an end-to-end system that reconstructs an interactive 3D model of a real indoor space from data users can realistically provide (images, video, floor plans, sensor data), and adds navigation and search on top of it. 

The end goal is live, in-person navigation: think Google Maps walking directions, but indoors, guided through the phone camera. 

A user with no technical expertise should be able to: 

- **Capture** a real indoor space (an office floor, a retail store, a mall section) using only a smartphone. 

- **Reconstruct** it into a photorealistic 3D model with no manual 3D modelling. 

- **Explore** the space remotely in a web browser, walking through it freely like a video-game walkthrough. 

- **Navigate** the space on-site through their phone: pick a destination like "Meeting Room 4" or "3-seater sofas" and get guided to it through the live camera view, with directions updating as they walk. 

## **Scope & Required Deliverables** 

Participants must build a solution encompassing the following sequential steps. Since depth analysis and stitching can be highly complex for large corporate areas, teams are free to utilize any technology currently available in the market. 

- **SOP Construction & 3D Modeling:** Participants must define their own Standard Operating Procedure (SOP) for data collection. This SOP dictates how the space is captured (e.g., specifying camera angles, corner shots,floor plan or utilizing sensors). The captured data - whether it involves manually stitching different rooms or automatically processing a single large video file - must be used to construct a reliable 3D model. 

- **Virtual Desktop Walkthrough:** The platform must allow users to freely roam and look around the generated 3D space through a zero-install desktop or web-view interface. Users should experience fluid, first-person movement using standard controls like WASD keys and mouse inputs. This must function smoothly even without active navigation running. 

- **Point of Interest (POI) Labeling:** The 3D space must support POI tagging (e.g., "Reception", "Meeting Room A"). Users should be able to click on specific rooms or zones within the model to reveal their designated names. 

- **Desktop Navigation:** Once a POI is selected, the UI must provide active path-planning and navigation, visually guiding the user to the destination similar to movement in a video game. This desktop navigation is mandatory 



<!-- Start of picture text -->
—<br>Techfest Office, Students’ Activity Centre,  www.techfest.org<br>IIT Bombay, Mumbai - 400076<br><!-- End of picture text -->



<!-- Start of picture text -->
IF Techfest Techfest, IIT Bombay<br>Asia’s Largest Science & Technology Festival<br><!-- End of picture text -->

and must compute optimal walking paths that stay on the floor and avoid physical obstacles. 

- **AR Navigation (Bonus):** As an advanced bonus step, teams can implement Augmented Reality (AR) navigation for mobile devices. 

**_Incentive:_** Participants who complete the full pipeline end to end, including AR navigation will earn the opportunity to be considered for a full time job opportunity at Juspay. 

## **Format of Competition:** 

### **Round 1: 3D Reconstruction & Roaming (Online)** 

- **Focus:** SOP construction, 3D model building, and free-roaming 

- **Format:** Online submission via Techfest portal. 

- **Dataset:** Participants test and map their own home (or a similarly accessible indoor space) based on their defined Standard Operating Procedure (SOP). 

- **Deliverables:** Submit a Round 1 Google Drive folder link ("Anyone with the link can view") containing: 

   - **Technical Abstract PDF (max 5 pages):** System architecture, pipeline design, SOP construction details, and technical approach. 

   - **Proof of Concept & Web Viewer Link:** A document containing a working link to the web-viewer allowing free-roaming. 

   - **Demonstration Video:** A 3 to 5-minute video detailing the project scope, capture process, and showing the 3D web walkthrough. 

   - **Code Repository:** A link/folder containing setup instructions to reconstruct the model, along with sample data placed inside a test directory. 

- **Evaluation Criteria:** SOP & Pipeline Soundness, Visual Quality & Model Fidelity, Web Viewer Performance, and Documentation & Video Clarity 

### **Round 2: POIs & Navigation (Online)** 

- **Focus:** POI labeling and desktop pathfinding UI. 

- **Format:** Online submission via Techfest portal. 

- **Deliverables:** Submit an updated Round 2 Google Drive folder ("Anyone with the link can view") containing: 

   - **Updated Code Repository Link:** A document pointing to the repository branch containing POI and navigation implementations. 

   - **Live Web App Link:** A working URL demonstrating the ability to click on POIs, execute spatial searches, and follow generated walkable floor paths. 

   - **Demonstration Video:** A 3 to 5-minute video showing search execution, POI interaction, and obstacle-aware path visualization. 



<!-- Start of picture text -->
—<br>Techfest Office, Students’ Activity Centre,  www.techfest.org<br>IIT Bombay, Mumbai - 400076<br><!-- End of picture text -->



<!-- Start of picture text -->
IF Techfest Techfest, IIT Bombay<br>Asia’s Largest Science & Technology Festival<br><!-- End of picture text -->

- **Evaluation Criteria:** Spatial Indexing & POI Tagging, Pathfinding Accuracy, Search UI & Transition, and Code Cleanliness & Repository Setup. 

### **Round 3: On-Site Capture & Live Finale (On Campus at IIT Bombay)** 

- **Focus:** Mapping a completely new location. 

- **Format:** On-site data collection, execution, and live presentation at the IIT Bombay campus. 

   - **Day 1 (On-Site Data Capture & Processing):** Qualifying teams will be assigned a specific physical venue on campus (e.g., inside the Lecture Hall Complex - LHC). Teams will collect data on-site using their required hardware/sensors according to their SOP, execute their pipeline, reconstruct the 3D digital twin, annotate POIs, and deploy their full interactive platform within the given timeframe. 

   - **Day 2 (Live Presentation Phase):** Live demonstration, pitch, and technical Q&A with expert judges on campus. 

- **Deliverables to Present:** 

   - **10-Minute Live Pitch & Platform Demo:** Demonstration of the custom venue capture, reconstructed 3D web platform, POI search, and walking path navigation live in front of the panel. 

   - **5-Minute Technical Q&A:** Cross-examination by judges regarding capture SOP efficiency, processing turnaround time, pathfinding accuracy, and pipeline scalability. 

- **Evaluation Criteria:** 

   - **SOP Execution & Field Capture (20%):** Efficiency and practicality of the team's data collection method on-site. 

   - **Reconstruction & Visual Quality (20%):** Fidelity, structural integrity, and visual clarity of the reconstructed venue. 

   - **Web Viewer & UX (20%):** Responsiveness, fluid exploration, and movement performance inside the browser. 

   - **Spatial Search & Path Calculation (20%):** Accuracy of POI tagging, instant search transitions, and non-colliding pathing around physical obstacles. 

   - **Final Pitch & Technical Q&A (20%):** Clarity of live demonstration and technical depth during judge Q&A. 

   - **On-Site AR Navigation (Bonus/10%):** Accuracy of real-time camera tracking and live directional arrow overlays on-site. 

## **Team Specifications & Eligibility:** 



<!-- Start of picture text -->
—<br>Techfest Office, Students’ Activity Centre,  www.techfest.org<br>IIT Bombay, Mumbai - 400076<br><!-- End of picture text -->



<!-- Start of picture text -->
IF Techfest Techfest, IIT Bombay<br>Asia’s Largest Science & Technology Festival<br><!-- End of picture text -->

- **Eligibility:** Open to all students with a valid ID from their educational institution. 

- **Team Size:** Teams may include students from different institutes. Maximum of 4 members per team. 

### **General Rules:** 

1. Teams must register online at techfest.org, receiving a Team ID for future reference. 

2. The organizers' and judges' decisions are final and binding. Techfest reserves the right to verify participant details. 

3. Techfest, IIT Bombay, is not responsible for late or lost entries. 

4. Solutions must be the team's own original work. Teams may build on open-source libraries and third-party tools, provided they comply with the relevant licences and credit them in the technical abstract. Submissions must not infringe third-party intellectual property. 

5. The latest information will be available on techfest.org, with registered participants notified of changes via email. 

6. All technical, procedural, and competition-related queries must be submitted directly through the Techfest Competition Portal under the Doubt section. Participants are strictly requested to regularly check the portal for answers and updates 

7. Official communication for important announcements will be through the email <u>aryan@techfest.org. Queries submitted via email will not be</u> entertained 

### **Presentation & Submission Guidelines for Additional Drive Materials** 

- **Document Formatting Requirement:** If your team includes additional links, live web demos, prototype access URLs, or supplementary technical documents inside your Google Drive folder, **they must be neatly formatted and presented inside a single organized master PDF or Google Doc** (e.g., Additional_Links_and_Prototypes.pdf). 

- Loose links or unorganized files inside the Drive folder will not be reviewed by judges. Ensure all folder permissions remain open ("Anyone with the link can view") 

## **Timeline** 

|Event|Date|
|---|---|
|Last Date of Registration|15th October 2026|





<!-- Start of picture text -->
—<br>Techfest Office, Students’ Activity Centre,  www.techfest.org<br>IIT Bombay, Mumbai - 400076<br><!-- End of picture text -->



<!-- Start of picture text -->
IF Techfest Techfest, IIT Bombay<br>Asia's Largest Science & Technology Festival<br><!-- End of picture text -->

|Last Date for Round 1 Submission (3D Reconstruction<br>& Roaming)|31st October 2026|
|---|---|
|Round 1 Results Announcement|10th November 2026|
|Last<br>Date<br>for<br>Round<br>2<br>Submission<br>(POIs<br>&<br>Navigation)|30th November 2026|
|Round 2 Results / Finalist Announcement|7th December 2026|
|Round 3: On-Site Capture & Processing at IIT<br>Bombay (Day 1)|16th December 2026|
|Round 3: Live Pitch & Technical Q&A (Day 2)|17th December 2026|



## **Prize Money:** 

The Prize Money will be awarded to the top 3 winners of the final round via NEFT and will be processed by May 2027. 

## **Prize Money Submission Process** 

- **Submission Channel:** Complete the prize money form **directly on the website** after the final round concludes. The winners would be able to view the form through their registered email ID 

- **Deadline:** The form must be submitted by **December 31, 2026** . 

## **Details Needed for the Website Form** 

When filling out the form on the website, make sure you have the following bank account details ready: 

- Account Holder's Name 

- Account Number 

- Bank Name and Branch Name 

- IFSC Code 



<!-- Start of picture text -->
en<br>Techfest Office, Students’ Activity Centre,  www.techfest.org<br>IIT Bombay, Mumbai - 400076<br><!-- End of picture text -->

