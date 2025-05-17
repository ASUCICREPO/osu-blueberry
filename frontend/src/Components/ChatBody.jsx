import React, { useState, useRef, useEffect } from "react";
import { Grid, Avatar, Typography, Box } from "@mui/material";
// import Attachment from "./Attachment";
import ChatInput from "./ChatInput";
import UserAvatar from "../Assets/UserAvatar.svg";
import StreamingResponse from "./StreamingResponse";
import createMessageBlock from "../utilities/createMessageBlock";
import { ALLOW_FILE_UPLOAD, WEBSOCKET_API } from "../utilities/constants";
import BotFileCheckReply from "./BotFileCheckReply";
import { v4 as uuidv4 } from "uuid";

function ChatBody() {
  const session_id = uuidv4();

  const [messageList, setMessageList] = useState([
    createMessageBlock("Welcome user! In order to provide the most accurate responses, can you please tell me where you are growing blueberries?", "BOT", "TEXT", "RECEIVED"),
  ]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [location, setLocation] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messageList]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleFileUploadComplete = (fileData) => {
    console.log("File uploaded successfully:", fileData);
    const fileMessage = createMessageBlock(`File uploaded: ${fileData.name}`, "USER", "FILE", "SENT");
    setMessageList((prevList) => [...prevList, fileMessage]);
  };

  const handleSendMessage = (message) => {
    if (!message) {
      console.error("Message is empty!");
      return;
    }

    if (!location) {
      const userLocation = message;
      setLocation(userLocation);

      const locationMessage = createMessageBlock(userLocation, "USER", "TEXT", "SENT");
      setMessageList((prevList) => [...prevList, locationMessage]);

      const thankYouMessage = createMessageBlock(
        "Thank you for sharing that information! How can I help you today?",
        "BOT",
        "TEXT",
        "RECEIVED"
      );
      setMessageList((prevList) => [...prevList, thankYouMessage]);
      return;
    }

    setProcessing(true);

    const newMessageBlock = createMessageBlock(message, "USER", "TEXT", "SENT");
    const processingBlock = createMessageBlock("", "BOT", "TEXT", "PROCESSING");

    setMessageList((prevList) => [...prevList, newMessageBlock, processingBlock]);

    getBotResponse(setMessageList, setProcessing, message, location, session_id);
  };

  return (
    <Box display="flex" flexDirection="column" justifyContent="space-between" className="appHeight100 appWidth100">
      <Box flex={1} overflow="auto" className="chatScrollContainer">
        {messageList.map((msg, index) => (
          <Box key={index} mb={2}>
            {msg.sentBy === "USER" ? (
              <UserReply message={msg.message} />
            ) : msg.sentBy === "BOT" && msg.state === "PROCESSING" ? (
              <StreamingResponse initialMessage={msg.message} setProcessing={setProcessing} setMessageList={setMessageList} />
            ) : (
              <BotFileCheckReply
                message={msg.message}
                fileName={msg.fileName}
                fileStatus={msg.fileStatus}
                messageType={msg.sentBy === "USER" ? "user_doc_upload" : "bot_response"}
              />
            )}
          </Box>
        ))}
        <div ref={messagesEndRef} />
      </Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-end" sx={{ flexShrink: 0 }}>
        <Box sx={{ display: ALLOW_FILE_UPLOAD ? "flex" : "none" }}>
          {/* <Attachment onFileUploadComplete={handleFileUploadComplete} /> */}
        </Box>
        <Box sx={{ width: "100%" }} ml={2}>
          <ChatInput onSendMessage={handleSendMessage} processing={processing} message={message} setMessage={setMessage} />
        </Box>
      </Box>
    </Box>
  );
}

export default ChatBody;

function UserReply({ message }) {
  return (
    <Grid container direction="row" justifyContent="flex-end" alignItems="flex-end">
      <Grid item className="userMessage" sx={{ backgroundColor: (theme) => theme.palette.background.userMessage }}>
        <Typography variant="body2">{message}</Typography>
      </Grid>
      <Grid item>
        <Avatar alt={"User Profile Pic"} src={UserAvatar} />
      </Grid>
    </Grid>
  );
}

const getBotResponse = (setMessageList, setProcessing, message, location, session_id) => {
  const authToken = localStorage.getItem("authToken");
  const socket = new WebSocket(`${WEBSOCKET_API}?token=${authToken}`);

  socket.onopen = () => {
    const payload = {
      action: "sendMessage",
      querytext: message,
      session_id: session_id,
      location: location,
    };

    console.log(`🔵 Sent Request: ${JSON.stringify(payload)}`);
    socket.send(JSON.stringify(payload));
  };

  socket.onmessage = (event) => {
    try {
      console.log("📨 Raw WebSocket Message:", event.data);
      const botResponse = JSON.parse(event.data);
      const responseText = botResponse.responsetext;

      setProcessing(false);

      setMessageList((prevList) =>
        prevList.map((msg) =>
          msg.state === "PROCESSING" ? createMessageBlock(responseText, "BOT", "TEXT", "RECEIVED") : msg
        )
      );
    } catch (error) {
      console.error("❌ Error parsing WebSocket response: ", error);
      setProcessing(false);
      setMessageList((prevList) =>
        prevList.map((msg) =>
          msg.state === "PROCESSING"
            ? createMessageBlock("Error parsing response. Please try again.", "BOT", "TEXT", "RECEIVED")
            : msg
        )
      );
    }
  };

  socket.onerror = (error) => console.error(`❌ WebSocket Error: ${error.message}`);
  socket.onclose = (event) => {
    console.warn(`🟠 WebSocket Closed: Code ${event.code}, Reason: ${event.reason}`);
    socket.close();
  };
};


// import React, { useState, useRef, useEffect } from "react";
// import { Grid, Avatar, Typography, Box } from "@mui/material";
// import Attachment from "./Attachment";
// import ChatInput from "./ChatInput";
// import UserAvatar from "../Assets/UserAvatar.svg";
// import StreamingResponse from "./StreamingResponse";
// import createMessageBlock from "../utilities/createMessageBlock";
// import { ALLOW_FILE_UPLOAD } from "../utilities/constants";
// import BotFileCheckReply from "./BotFileCheckReply";
// import { WEBSOCKET_API } from "../utilities/constants";

// function ChatBody() {
//   const [messageList, setMessageList] = useState([
//     createMessageBlock("Welcome user! In order to provide the most accurate responses, can you please tell me where you are growing blueberries?", "BOT", "TEXT", "RECEIVED"),
//   ]);
//   const [processing, setProcessing] = useState(false);
//   const [message, setMessage] = useState("");
//   const [questionAsked, setQuestionAsked] = useState(false);
//   const [location, setLocation] = useState("");
//   const [email, setEmail] = useState("");
//   const [waitingForEmail, setWaitingForEmail] = useState(false);
//   const messagesEndRef = useRef(null);
//   const [previousQuery, setPreviousQuery] = useState("");
//   const [lastEmailQuerySent, setLastEmailQuerySent] = useState(false);


//   useEffect(() => {
//     scrollToBottom();
//   }, [messageList]);

//   const scrollToBottom = () => {
//     if (messagesEndRef.current) {
//       messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
//     }
//   };

//   const handleFileUploadComplete = (fileData) => {
//     console.log("File uploaded successfully:", fileData);
//     const fileMessage = createMessageBlock(`File uploaded: ${fileData.name}`, "USER", "FILE", "SENT");
//     setMessageList((prevList) => [...prevList, fileMessage]);
//   };

//   const handleSendMessage = (message) => {
//     if (!message) {
//       console.error("Message is empty!");
//       return; // Handle empty messages
//     }

//     if (!location) {
//       const userLocation = message;
//   setLocation(userLocation);

//   const locationMessage = createMessageBlock(userLocation, "USER", "TEXT", "SENT");
//   setMessageList((prevList) => [...prevList, locationMessage]);

//   const thankYouMessage = createMessageBlock(
//     "Thank you for sharing that information! How can I help you today?",
//     "BOT",
//     "TEXT",
//     "RECEIVED"
//   );
//   setMessageList((prevList) => [...prevList, thankYouMessage]);

//   return;
//     } else if (waitingForEmail) {
//       setEmail(message);
//       setWaitingForEmail(false);

//       const userEmailMessage = createMessageBlock(message, "USER", "TEXT", "SENT");
//       setMessageList((prevList) => [...prevList, userEmailMessage]);

//       // Immediately resend the previous query with email
//       if (previousQuery) {
//         getBotResponse(setMessageList, setProcessing, previousQuery, setWaitingForEmail, message, setEmail, true, setPreviousQuery, location);
//       }

//       const confirmationMessage = createMessageBlock(
//         "Thank you for your email. The Admin will get back to you when we have an update on this query.",
//         "BOT",
//         "TEXT",
//         "RECEIVED"
//       );
//       setMessageList((prevList) => [...prevList, confirmationMessage]);
//     } else {
//       setProcessing(true);
//       setLastEmailQuerySent(false);


//       const newMessageBlock = createMessageBlock(message, "USER", "TEXT", "SENT");
//       const processingBlock = createMessageBlock("", "BOT", "TEXT", "PROCESSING");

//       setMessageList((prevList) => [...prevList, newMessageBlock, processingBlock]);
//       setQuestionAsked(true);

//       // Store the last question in case email is needed later
//       setPreviousQuery(message);

//       getBotResponse(setMessageList, setProcessing, message, setWaitingForEmail, email, setEmail, false, setPreviousQuery, location, lastEmailQuerySent, setLastEmailQuerySent);
//     }
//   };

//   return (
//     <Box display="flex" flexDirection="column" justifyContent="space-between" className="appHeight100 appWidth100">
//       <Box flex={1} overflow="auto" className="chatScrollContainer">
//         {messageList.map((msg, index) => (
//           <Box key={index} mb={2}>
//             {msg.sentBy === "USER" ? (
//               <UserReply message={msg.message} />
//             ) : msg.sentBy === "BOT" && msg.state === "PROCESSING" ? (
//               <StreamingResponse initialMessage={msg.message} setProcessing={setProcessing} setMessageList={setMessageList} />
//             ) : (
//               <BotFileCheckReply
//                 message={msg.message}
//                 fileName={msg.fileName}
//                 fileStatus={msg.fileStatus}
//                 messageType={msg.sentBy === "USER" ? "user_doc_upload" : "bot_response"}
//               />
//             )}
//           </Box>
//         ))}
//         <div ref={messagesEndRef} />
//       </Box>
//       <Box display="flex" justifyContent="space-between" alignItems="flex-end" sx={{ flexShrink: 0 }}>
//         <Box sx={{ display: ALLOW_FILE_UPLOAD ? "flex" : "none" }}>
//           <Attachment onFileUploadComplete={handleFileUploadComplete} />
//         </Box>
//         <Box sx={{ width: "100%" }} ml={2}>
//           <ChatInput onSendMessage={handleSendMessage} processing={processing} message={message} setMessage={setMessage} />
//         </Box>
//       </Box>
//     </Box>
//   );
// }

// export default ChatBody;

// function UserReply({ message }) {
//   return (
//     <Grid container direction="row" justifyContent="flex-end" alignItems="flex-end">
//       <Grid item className="userMessage" sx={{ backgroundColor: (theme) => theme.palette.background.userMessage }}>
//         <Typography variant="body2">{message}</Typography>
//       </Grid>
//       <Grid item>
//         <Avatar alt={"User Profile Pic"} src={UserAvatar} />
//       </Grid>
//     </Grid>
//   );
// }

// const getBotResponse = (setMessageList, setProcessing, message, setWaitingForEmail, email, setEmail, isEmailQuery, setPreviousQuery, location, lastEmailQuerySent, setLastEmailQuerySent) => {
//   const authToken = localStorage.getItem("authToken");
//   const socket = new WebSocket(`${WEBSOCKET_API}?token=${authToken}`);

//   socket.onopen = () => {
//     let payload;

//     if (isEmailQuery && email) {
//       // Resend the previous query with email when requested
//       if (lastEmailQuerySent) {
//         console.log("⚠️ Email query already sent. Skipping duplicate.");
//         return;
//       }
//       setLastEmailQuerySent(true);
//       payload = {
//         action: "sendMessage",
//         email: email,
//         session_id: "session_123",
//         querytext: message,
//         location: location,
//       };
//     } else {
//       // Normal query without email
//       payload = {
//         action: "sendMessage",
//         querytext: message,
//         session_id: "session_123",
//         location: location,

//       };
//     }

//     console.log(`🔵 Sent Request: ${JSON.stringify(payload)}`);
//     socket.send(JSON.stringify(payload));
//   };

//   socket.onmessage = (event) => {
//     try {
//       console.log("📨 Raw WebSocket Message:", event.data); // Add this line
//       const botResponse = JSON.parse(event.data);
//       const responseText = botResponse.responsetext;
//       const requiresEmail = botResponse.requires_email;
//       const email_status = botResponse.email_status;
//       // console.log(`🟢 Received Data: ${botResponse}`)
//       console.log(`🟢 Received Response: ${responseText}`);
//       console.log(`🟢 Received Email: ${email_status}`);


//       setProcessing(false);

//       setMessageList((prevList) =>
//         prevList.map((msg) =>
//           msg.state === "PROCESSING" ? createMessageBlock(responseText, "BOT", "TEXT", "RECEIVED") : msg
//         )
//       );

//       if (requiresEmail && email_status!="success") {
//         if (email) {
//           console.log("🔁 Resending previous query with stored email");
      
//           getBotResponse(
//             setMessageList,
//             setProcessing,
//             message,
//             setWaitingForEmail,
//             email,
//             setEmail,
//             true,
//             setPreviousQuery,
//             location,
//             lastEmailQuerySent,
//   setLastEmailQuerySent
//           );
//           return;
//         } else {
//           setWaitingForEmail(true);
//           setPreviousQuery(message);
      
//           // Prevent duplicate email request messages
//           setMessageList((prevList) => {
//             const lastBotMessage = prevList[prevList.length - 1]?.message;
//             if (lastBotMessage !== "Please provide your email so Admin can get back to you.") {
//               return [
//                 ...prevList,
//                 createMessageBlock("Please provide your email so Admin can get back to you.", "BOT", "TEXT", "RECEIVED"),
//               ];
//             }
//             return prevList;
//           });
//           return;
//         }
//       }
      
//     } catch (error) {
//       console.error("❌ Error parsing WebSocket response: ", error);
//       setProcessing(false);
//       setMessageList((prevList) =>
//         prevList.map((msg) =>
//           msg.state === "PROCESSING"
//             ? createMessageBlock("Error parsing response. Please try again.", "BOT", "TEXT", "RECEIVED")
//             : msg
//         )
//       );
//     }
//   };

//   socket.onerror = (error) => console.error(`❌ WebSocket Error: ${error.message}`);
//   socket.onclose = (event) => {
//     console.warn(`🟠 WebSocket Closed: Code ${event.code}, Reason: ${event.reason}`);
//     socket.close(); // Clean up WebSocket on close
//   };
// };
