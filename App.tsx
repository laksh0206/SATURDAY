import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { CompanionFace } from "./src/components/CompanionFace";
import { MODE_ORDER, MODE_THEMES } from "./src/modes";
import { RealtimeClient } from "./src/services/realtime";
import { Storage } from "./src/services/storage";
import { CompanionMode, FaceState, Memory, TranscriptItem, VoiceEvent } from "./src/types";

const newItem = (role: TranscriptItem["role"], text: string): TranscriptItem => ({
  id: `${Date.now()}-${Math.random()}`,
  role,
  text
});

export default function App() {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<CompanionMode>("active");
  const [faceState, setFaceState] = useState<FaceState>("idle");
  const [backendUrl, setBackendUrl] = useState("");
  const [draftBackendUrl, setDraftBackendUrl] = useState("");
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [transcript, setTranscript] = useState<TranscriptItem[]>([
    newItem("system", "Choose a mode, connect your private server, then tap Talk.")
  ]);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const client = useRef<RealtimeClient | null>(null);
  const liveText = useRef("");

  const theme = MODE_THEMES[mode];
  const title = useMemo(() => (mode === "sleep" ? "Nova is resting" : `Nova · ${theme.label}`), [mode, theme.label]);

  useEffect(() => {
    void (async () => {
      const [storedMode, storedMemories, storedUrl] = await Promise.all([
        Storage.getMode(),
        Storage.getMemories(),
        Storage.getBackendUrl()
      ]);
      setMode(storedMode);
      setFaceState(storedMode === "sleep" ? "sleeping" : "idle");
      setMemories(storedMemories);
      setBackendUrl(storedUrl ?? "");
      setDraftBackendUrl(storedUrl ?? "");
      setReady(true);
    })();
    return () => client.current?.disconnect();
  }, []);

  async function changeMode(next: CompanionMode) {
    if (isTalking) stopTalking();
    setMode(next);
    setFaceState(next === "sleep" ? "sleeping" : "idle");
    await Storage.saveMode(next);
  }

  function updateAssistantText(text: string) {
    setTranscript((items) => {
      const withoutLive = items.filter((item) => item.id !== "live-assistant");
      return [...withoutLive, { id: "live-assistant", role: "assistant", text }];
    });
  }

  function handleVoiceEvent(event: VoiceEvent) {
    if (event.type === "connected") {
      setFaceState("listening");
      setTranscript((items) => [...items, newItem("system", "Voice is live. Speak naturally; Nova will stop when you interrupt.")]);
      return;
    }
    if (event.type === "speech_started") {
      setFaceState("listening");
      return;
    }
    if (event.type === "speech_stopped") {
      setFaceState("thinking");
      return;
    }
    if (event.type === "user_text") {
      setTranscript((items) => [...items, newItem("user", event.text)]);
      return;
    }
    if (event.type === "response_started") {
      liveText.current = "";
      setFaceState("talking");
      return;
    }
    if (event.type === "response_text") {
      liveText.current += event.text;
      updateAssistantText(liveText.current);
      return;
    }
    if (event.type === "response_done") {
      setTranscript((items) =>
        items.map((item) =>
          item.id === "live-assistant" ? { ...item, id: `assistant-${Date.now()}` } : item
        )
      );
      setFaceState("happy");
      setTimeout(() => setFaceState((current) => (current === "happy" ? "listening" : current)), 900);
      return;
    }
    if (event.type === "error") {
      setFaceState("error");
      setIsTalking(false);
      setTranscript((items) => [...items, newItem("system", event.message)]);
    }
  }

  async function startTalking() {
    if (mode === "sleep") {
      await changeMode("active");
      setTranscript((items) => [...items, newItem("system", "Nova woke up in Active mode.")]);
      return;
    }
    if (!backendUrl) {
      setSettingsVisible(true);
      setTranscript((items) => [...items, newItem("system", "Add your private server address in Settings first.")]);
      return;
    }

    try {
      setFaceState("thinking");
      setIsTalking(true);
      const nextClient = new RealtimeClient();
      client.current = nextClient;
      await nextClient.connect({ backendUrl, mode, memories, onEvent: handleVoiceEvent });
    } catch (error) {
      setIsTalking(false);
      setFaceState("error");
      setTranscript((items) => [...items, newItem("system", error instanceof Error ? error.message : "Could not start voice.")]);
    }
  }

  function stopTalking() {
    client.current?.disconnect();
    client.current = null;
    setIsTalking(false);
    setFaceState(mode === "sleep" ? "sleeping" : "idle");
    setTranscript((items) => [...items, newItem("system", "Voice session ended. Your local memories remain on this phone.")]);
  }

  async function saveBackend() {
    const clean = draftBackendUrl.trim().replace(/\/$/, "");
    await Storage.saveBackendUrl(clean);
    setBackendUrl(clean);
    setSettingsVisible(false);
  }

  async function addMemory() {
    const text = memoryDraft.trim().slice(0, 240);
    if (!text) return;
    const next = [{ id: String(Date.now()), text, createdAt: new Date().toISOString() }, ...memories];
    setMemories(next);
    setMemoryDraft("");
    await Storage.saveMemories(next);
  }

  async function removeMemory(id: string) {
    const next = memories.filter((memory) => memory.id !== id);
    setMemories(next);
    await Storage.saveMemories(next);
  }

  function clearMemories() {
    Alert.alert("Clear all memories?", "This removes the locally saved notes from this phone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => {
          setMemories([]);
          void Storage.saveMemories([]);
        }
      }
    ]);
  }

  if (!ready) return <View style={styles.loading}><Text style={styles.loadingText}>Waking Nova…</Text></View>;

  return (
    <LinearGradient colors={theme.colors} style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <View>
            <Text style={styles.name}>{title}</Text>
            <Text style={styles.subhead}>{theme.description}</Text>
          </View>
          <Pressable accessibilityLabel="Open settings" onPress={() => setSettingsVisible(true)} style={styles.settingsButton}>
            <Text style={styles.settingsText}>⚙</Text>
          </Pressable>
        </View>

        <CompanionFace mode={mode} state={faceState} />

        <View style={styles.modeRow} accessibilityRole="tablist">
          {MODE_ORDER.map((item) => {
            const selected = item === mode;
            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => void changeMode(item)}
                style={[styles.modeTab, selected && { backgroundColor: MODE_THEMES[item].accent }]}
              >
                <Text style={[styles.modeText, selected && styles.modeTextSelected]}>{MODE_THEMES[item].label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={isTalking ? stopTalking : () => void startTalking()}
            style={[styles.talkButton, { backgroundColor: isTalking ? "#223047" : theme.accent }]}
          >
            <Text style={[styles.talkButtonText, !isTalking && { color: theme.colors[0] }]}>
              {isTalking ? "End conversation" : mode === "sleep" ? "Wake Nova" : "Talk to Nova"}
            </Text>
          </Pressable>
          <Pressable onPress={() => setSettingsVisible(true)} style={styles.memoryShortcut}>
            <Text style={styles.memoryShortcutText}>Memory · {memories.length}</Text>
          </Pressable>
        </View>

        <View style={styles.transcriptCard}>
          <Text style={styles.cardTitle}>Conversation</Text>
          <ScrollView contentContainerStyle={styles.transcriptContent} showsVerticalScrollIndicator={false}>
            {transcript.slice(-6).map((item) => (
              <View key={item.id} style={[styles.message, item.role === "assistant" && styles.assistantMessage]}>
                <Text style={styles.messageRole}>{item.role === "assistant" ? "NOVA" : item.role === "user" ? "YOU" : "STATUS"}</Text>
                <Text style={styles.messageText}>{item.text}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>

      <Modal visible={settingsVisible} transparent animationType="slide" onRequestClose={() => setSettingsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Your private controls</Text>
            <Text style={styles.sheetDescription}>
              Nova keeps memories on this phone. Your AI key belongs only on the private server, never here.
            </Text>

            <Text style={styles.inputLabel}>Private server address</Text>
            <TextInput
              value={draftBackendUrl}
              onChangeText={setDraftBackendUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://your-server.example"
              placeholderTextColor="#78859B"
              style={styles.input}
            />
            <Pressable onPress={() => void saveBackend()} style={styles.primarySmall}>
              <Text style={styles.primarySmallText}>Save server</Text>
            </Pressable>

            <View style={styles.memoryHeader}>
              <Text style={styles.inputLabel}>Approved memories</Text>
              <Pressable onPress={clearMemories}><Text style={styles.clearText}>Clear all</Text></Pressable>
            </View>
            <View style={styles.memoryComposer}>
              <TextInput
                value={memoryDraft}
                onChangeText={setMemoryDraft}
                placeholder="Example: I prefer concise answers."
                placeholderTextColor="#78859B"
                maxLength={240}
                style={[styles.input, styles.memoryInput]}
              />
              <Pressable onPress={() => void addMemory()} style={styles.addButton}><Text style={styles.addText}>Add</Text></Pressable>
            </View>
            <ScrollView style={styles.memoryList}>
              {memories.length === 0 ? (
                <Text style={styles.emptyMemory}>No saved memories. Add only things you want Nova to know.</Text>
              ) : memories.map((memory) => (
                <View key={memory.id} style={styles.memoryItem}>
                  <Text style={styles.memoryText}>{memory.text}</Text>
                  <Pressable accessibilityLabel="Delete memory" onPress={() => void removeMemory(memory.id)}>
                    <Text style={styles.deleteText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setSettingsVisible(false)} style={styles.closeButton}><Text style={styles.closeText}>Done</Text></Pressable>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 20 },
  loading: { flex: 1, backgroundColor: "#102137", alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#EAF7FF", fontSize: 18, fontWeight: "800" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8 },
  name: { color: "#FFFFFF", fontSize: 25, fontWeight: "900", letterSpacing: -0.6 },
  subhead: { color: "rgba(255,255,255,0.74)", fontSize: 13, marginTop: 4, maxWidth: 260 },
  settingsButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.15)", justifyContent: "center", alignItems: "center" },
  settingsText: { color: "#FFFFFF", fontSize: 21 },
  modeRow: { flexDirection: "row", justifyContent: "center", gap: 7, marginTop: -8 },
  modeTab: { paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "rgba(255,255,255,0.13)", borderRadius: 14 },
  modeText: { color: "#E7EEF5", fontSize: 12, fontWeight: "800" },
  modeTextSelected: { color: "#182033" },
  actionRow: { flexDirection: "row", gap: 10, justifyContent: "center", alignItems: "center", marginTop: 15 },
  talkButton: { minWidth: 178, paddingHorizontal: 20, paddingVertical: 15, borderRadius: 20, alignItems: "center" },
  talkButtonText: { color: "#EAF2FF", fontWeight: "900", fontSize: 15 },
  memoryShortcut: { paddingHorizontal: 14, paddingVertical: 15, borderRadius: 20, backgroundColor: "rgba(15,23,42,0.34)" },
  memoryShortcutText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  transcriptCard: { flex: 1, minHeight: 140, marginTop: 16, marginBottom: 8, backgroundColor: "rgba(6,12,26,0.28)", borderRadius: 22, padding: 15 },
  cardTitle: { color: "#F8FAFC", fontSize: 13, fontWeight: "900", letterSpacing: 0.6 },
  transcriptContent: { gap: 9, paddingTop: 10, paddingBottom: 4 },
  message: { padding: 10, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" },
  assistantMessage: { backgroundColor: "rgba(255,255,255,0.16)" },
  messageRole: { color: "#A5F3FC", fontSize: 10, fontWeight: "900", letterSpacing: 0.7, marginBottom: 3 },
  messageText: { color: "#F1F5F9", fontSize: 13, lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(3,7,18,0.58)", justifyContent: "flex-end" },
  sheet: { maxHeight: "82%", backgroundColor: "#111B2D", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22 },
  sheetHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: "#63728A", marginBottom: 17 },
  sheetTitle: { color: "#F8FAFC", fontSize: 22, fontWeight: "900" },
  sheetDescription: { color: "#B6C4D6", fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 18 },
  inputLabel: { color: "#D9E4F2", fontSize: 12, fontWeight: "900", marginBottom: 7 },
  input: { borderWidth: 1, borderColor: "#31415A", borderRadius: 13, color: "#F8FAFC", paddingHorizontal: 13, paddingVertical: 12, fontSize: 14 },
  primarySmall: { alignSelf: "flex-start", marginTop: 9, backgroundColor: "#5EEAD4", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  primarySmallText: { color: "#112033", fontSize: 13, fontWeight: "900" },
  memoryHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 22 },
  clearText: { color: "#FCA5A5", fontSize: 12, fontWeight: "800", marginBottom: 7 },
  memoryComposer: { flexDirection: "row", gap: 8 },
  memoryInput: { flex: 1 },
  addButton: { justifyContent: "center", paddingHorizontal: 14, borderRadius: 13, backgroundColor: "#32465F" },
  addText: { color: "#EAF2FF", fontWeight: "900" },
  memoryList: { maxHeight: 166, marginTop: 11 },
  emptyMemory: { color: "#9AABC1", fontSize: 13, lineHeight: 19, paddingVertical: 5 },
  memoryItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 14, backgroundColor: "#1A283D", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 7 },
  memoryText: { color: "#E5EDF7", flex: 1, fontSize: 13, lineHeight: 18 },
  deleteText: { color: "#FCA5A5", fontSize: 25, lineHeight: 25 },
  closeButton: { alignItems: "center", marginTop: 14, paddingVertical: 13 },
  closeText: { color: "#93C5FD", fontSize: 14, fontWeight: "900" }
});
