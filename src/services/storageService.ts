
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc, query, onSnapshot, addDoc, serverTimestamp, updateDoc, where } from "firebase/firestore";

const COLLECTIONS = {
  GROUPS: 'scale_groups',
  ESCALA: 'escala_items',
  CHECKLISTS: 'checklists',
  NOTIFICATIONS: 'notifications',
};

export const storageService = {
  async getScaleGroups(): Promise<any[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTIONS.GROUPS));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  },

  async saveScaleGroup(group: any) {
    const groupRef = group.id ? doc(db, COLLECTIONS.GROUPS, group.id.toString()) : doc(collection(db, COLLECTIONS.GROUPS));
    await setDoc(groupRef, { ...group, id: groupRef.id }, { merge: true });
    return { ...group, id: groupRef.id };
  },

  async deleteScaleGroup(id: number) {
    await deleteDoc(doc(db, COLLECTIONS.GROUPS, id.toString()));
  },

  async getEscalaItems(): Promise<any[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTIONS.ESCALA));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  },

  async saveEscalaItem(item: any) {
    const itemRef = item.id ? doc(db, COLLECTIONS.ESCALA, item.id.toString()) : doc(collection(db, COLLECTIONS.ESCALA));
    await setDoc(itemRef, { ...item, id: itemRef.id }, { merge: true });
    return { ...item, id: itemRef.id };
  },

  async saveEscalaItems(newItems: any[]) {
    // Optimization: could use batched writes, but for now loop
    await Promise.all(newItems.map(item => this.saveEscalaItem(item)));
    return newItems;
  },

  async deleteEscalaItem(id: number) {
    await deleteDoc(doc(db, COLLECTIONS.ESCALA, id.toString()));
  },

  async getChecklists(): Promise<any[]> {
    const querySnapshot = await getDocs(collection(db, COLLECTIONS.CHECKLISTS));
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
  },

  async saveChecklist(checklist: any) {
    // Assuming 'placa' is unique and used as ID? No, current logic uses it as identifier.
    // Let's use the provided 'placa' as doc id to ensure uniqueness if that's the intent.
    const checklistRef = doc(db, COLLECTIONS.CHECKLISTS, checklist.placa);
    await setDoc(checklistRef, checklist, { merge: true });
    return { id: checklist.placa, ...checklist };
  },

  async saveChecklists(newChecklists: any[]) {
    await Promise.all(newChecklists.map(checklist => this.saveChecklist(checklist)));
    return newChecklists;
  },

  async deleteChecklist(placa: string) {
    await deleteDoc(doc(db, COLLECTIONS.CHECKLISTS, placa));
  },

  async getNotifications() {
      // Need a query to get latest 50
    const querySnapshot = await getDocs(collection(db, COLLECTIONS.NOTIFICATIONS));                
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  async addNotification(message: string, type: 'info' | 'success' | 'warning' | 'danger' | 'neutral') {
    await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
      message,
      type,
      timestamp: serverTimestamp()
    });
  },

  async updateChatMessage(id: string, newContent: string) {
    const docRef = doc(db, 'chat_messages', id);
    await updateDoc(docRef, {
      texto: newContent,
      isEdited: true,
      editedAt: serverTimestamp()
    });
  },

  async softDeleteChatMessage(id: string) {
    const docRef = doc(db, 'chat_messages', id);
    await updateDoc(docRef, {
      texto: "Esta mensagem foi apagada",
      isDeleted: true
    });
  },

  async clearChatHistory() {
    const q = query(collection(db, 'chat_messages'), where('isDeleted', '==', false));
    const snapshot = await getDocs(q);
    const batch = snapshot.docs.map(d => updateDoc(d.ref, {
      texto: "Esta mensagem foi apagada pelo administrador",
      isDeleted: true
    }));
    await Promise.all(batch);
  },

  async clearNotifications() {
    const querySnapshot = await getDocs(collection(db, COLLECTIONS.NOTIFICATIONS));
    await Promise.all(querySnapshot.docs.map(doc => deleteDoc(doc.ref)));
  },

  subscribeToDocas(callback: (items: any[]) => void) {
    const q = query(collection(db, COLLECTIONS.ESCALA));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(items);
    });
    return unsubscribe;
  }
};
