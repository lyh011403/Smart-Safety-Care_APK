
  # Smart Safety Care App

<img width="5760" height="3240" alt="S1" src="https://github.com/user-attachments/assets/0ededadb-08a0-4df4-8c02-b391e4e39a13" />

#AI 智慧長照監控系統

核心技術： Python, YOLO, 遷移學習, 知識蒸餾, OpenCV, LabelImg, Roboflow, Figma, GitHub Pages
專案概述： 獨立開發提升長照環境安全的全端 AI 監控應用，涵蓋資料集建置、模型訓練、輕量化優化，以及前端 UI/UX 設計與部署。
主要貢獻與成果：

遷移學習突破效能瓶頸： 運用 LabelImg 與 Roboflow 標註「人、剪刀、刀具」等危險情境資料。針對初期人物辨識率低落的痛點，主動導入遷移學習，先以開源人體資料集進行預訓練獲取初始權重，再以自建資料集進行微調與超參數優化，成功大幅提升 YOLO 物件偵測準確率。

模型輕量化： 應用知識蒸餾 ，將大型 YOLO 預訓練模型特徵轉移至輕量化模型，在維持高準確率的前提下，有效降低硬體運算資源消耗。

前端開發與部署： 運用 Figma 規劃高易用性的監控介面，優化醫護與家屬操作體驗；結合 Antigravity 進行網頁開發，並透過 Git 版本控制將專案部署至 GitHub Pages 上線。

<img width="1886" height="1691" alt="Group 1362788845" src="https://github.com/user-attachments/assets/711018a6-4afe-43e9-b1ee-55bb6047672d" />


  ## Running the code
  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

