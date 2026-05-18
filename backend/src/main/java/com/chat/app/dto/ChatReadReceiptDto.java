package com.chat.app.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ChatReadReceiptDto {
    private String messageId;
    private String readerId;
    private String senderId;
    private String status;
}
